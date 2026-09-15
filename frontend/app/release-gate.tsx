// ARTBOOST_AUTHENTICATED_IN_APP_RELEASE_GATE_V1_20260915
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { supabase } from "@/lib/supabase";

const BACKEND_URL = (
  process.env.EXPO_PUBLIC_BACKEND_URL ||
  process.env.EXPO_PUBLIC_API_URL ||
  "https://artboostai.com"
).trim().replace(/\/+$/, "");

type GateStatus = "PASS" | "FAIL" | "BLOCKED";
type GateResult = {
  name: string;
  status: GateStatus;
  detail: string;
  httpStatus?: number;
  elapsedMs?: number;
};

async function readJson(response: Response) {
  const text = await response.text();
  if (!text) return {};
  try { return JSON.parse(text); }
  catch { return { raw: text.slice(0, 300) }; }
}

async function checkedFetch(
  name: string,
  path: string,
  token: string,
  expected: number[] = [200],
): Promise<{ result: GateResult; data: any }> {
  const started = Date.now();
  try {
    const response = await fetch(`${BACKEND_URL}${path}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });
    const data = await readJson(response);
    const elapsedMs = Date.now() - started;
    const ok = expected.includes(response.status);
    return {
      result: {
        name,
        status: ok ? "PASS" : "FAIL",
        detail: ok
          ? `HTTP ${response.status} in ${elapsedMs}ms`
          : String(data?.error || data?.details || `Unexpected HTTP ${response.status}`),
        httpStatus: response.status,
        elapsedMs,
      },
      data,
    };
  } catch (error: any) {
    return {
      result: {
        name,
        status: "FAIL",
        detail: String(error?.message || error || "Request failed"),
        elapsedMs: Date.now() - started,
      },
      data: {},
    };
  }
}

export default function ReleaseGateScreen() {
  const [running, setRunning] = useState(true);
  const [results, setResults] = useState<GateResult[]>([]);
  const [startedAt, setStartedAt] = useState("");

  async function runGate() {
    setRunning(true);
    setResults([]);
    setStartedAt(new Date().toISOString());
    const next: GateResult[] = [];

    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    const session = sessionData?.session;
    const token = session?.access_token?.trim() || "";

    if (sessionError || !session?.user?.id || !token) {
      next.push({
        name: "Authenticated Supabase session",
        status: "FAIL",
        detail: sessionError?.message || "No signed-in ArtBoost session is available.",
      });
      setResults(next);
      setRunning(false);
      return;
    }

    const { data: verified, error: verifyError } = await supabase.auth.getUser(token);
    if (verifyError || verified?.user?.id !== session.user.id) {
      next.push({
        name: "Authenticated Supabase session",
        status: "FAIL",
        detail: verifyError?.message || "Supabase could not verify the current session.",
      });
      setResults(next);
      setRunning(false);
      return;
    }

    next.push({
      name: "Authenticated Supabase session",
      status: "PASS",
      detail: "Current signed-in session verified by Supabase Auth.",
    });

    const stores = await checkedFetch("Stores", "/stores", token);
    next.push(stores.result);

    const products = await checkedFetch("Products", "/products?limit=1", token);
    next.push(products.result);

    const history = await checkedFetch(
      "Publishing History - today",
      "/ai/publishing-history?range=today",
      token,
    );
    next.push(history.result);

    const storeList = Array.isArray(stores.data?.stores)
      ? stores.data.stores
      : Array.isArray(stores.data)
        ? stores.data
        : [];

    const firstStore = storeList.find(
      (store: any) => String(store?.id || store?.store_id || store?.storeId || "").trim(),
    );

    if (firstStore) {
      const storeId = String(
        firstStore.id || firstStore.store_id || firstStore.storeId,
      ).trim();
      const automations = await checkedFetch(
        "Store-scoped automations",
        `/automations/store/${encodeURIComponent(storeId)}`,
        token,
      );
      next.push(automations.result);
    } else {
      next.push({
        name: "Store-scoped automations",
        status: "BLOCKED",
        detail: "No connected store ID was returned. The gate did not create test data.",
      });
    }

    if (history.result.status === "PASS") {
      const data = history.data;
      const records = Array.isArray(data)
        ? data
        : Array.isArray(data?.history)
          ? data.history
          : Array.isArray(data?.records)
            ? data.records
            : Array.isArray(data?.items)
              ? data.items
              : [];

      next.push({
        name: "Publishing History response",
        status: "PASS",
        detail: `${records.length} record(s) recognized in today's window.`,
      });

      next.push(
        records.length
          ? {
              name: "Publishing History outcome evidence",
              status: records.some(
                (row: any) =>
                  row?.platforms ||
                  row?.platformResults ||
                  row?.results ||
                  row?.outcomes ||
                  row?.status,
              )
                ? "PASS"
                : "FAIL",
              detail: records.some(
                (row: any) =>
                  row?.platforms ||
                  row?.platformResults ||
                  row?.results ||
                  row?.outcomes ||
                  row?.status,
              )
                ? "Current history contains platform/status outcome evidence."
                : "History records exist but recognizable outcome evidence is missing.",
            }
          : {
              name: "Publishing History outcome evidence",
              status: "BLOCKED",
              detail: "No publishing records exist in today's window.",
            },
      );
    }

    // Fail-closed identity isolation check: a caller-supplied different userId
    // must never override the verified Bearer-token identity.
    const mismatchId = "00000000-0000-4000-8000-000000000001";
    const isolation = await checkedFetch(
      "Authenticated identity mismatch rejection",
      `/stores?userId=${encodeURIComponent(mismatchId)}`,
      token,
      [403],
    );
    next.push(isolation.result);

    setResults(next);
    setRunning(false);
  }

  useEffect(() => { void runGate(); }, []);

  const counts = useMemo(() => ({
    pass: results.filter((r) => r.status === "PASS").length,
    fail: results.filter((r) => r.status === "FAIL").length,
    blocked: results.filter((r) => r.status === "BLOCKED").length,
  }), [results]);

  const verdict =
    running ? "RUNNING" :
    counts.fail > 0 ? "RED LIGHT" :
    counts.blocked > 0 ? "INCOMPLETE" :
    "GREEN LIGHT";

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>ArtBoost Authenticated Release Gate</Text>
      <Text style={styles.subtitle}>
        Runs automatically inside your real signed-in ArtBoost session. Read-only.
      </Text>

      <View style={styles.summary}>
        {running && <ActivityIndicator size="large" />}
        <Text style={styles.verdict}>{verdict}</Text>
        <Text style={styles.counts}>
          PASS {counts.pass}   FAIL {counts.fail}   BLOCKED {counts.blocked}
        </Text>
        {!!startedAt && <Text style={styles.time}>Started {startedAt}</Text>}
      </View>

      {results.map((result, index) => (
        <View key={`${result.name}-${index}`} style={styles.row}>
          <Text style={styles.status}>{result.status}</Text>
          <View style={styles.rowBody}>
            <Text style={styles.name}>{result.name}</Text>
            <Text style={styles.detail}>{result.detail}</Text>
          </View>
        </View>
      ))}

      {!running && (
        <Pressable style={styles.button} onPress={() => void runGate()}>
          <Text style={styles.buttonText}>Run Again</Text>
        </Pressable>
      )}

      <Text style={styles.footer}>
        This gate does not publish posts, change schedules, sync stores, alter billing,
        modify Git, or write test records.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 24, backgroundColor: "#070611" },
  title: { color: "#fff", fontSize: 28, fontWeight: "800", marginTop: 20 },
  subtitle: { color: "#b9b5c9", fontSize: 15, marginTop: 8, marginBottom: 20 },
  summary: { padding: 18, borderRadius: 16, backgroundColor: "#151224", marginBottom: 18 },
  verdict: { color: "#fff", fontSize: 24, fontWeight: "800", marginTop: 10 },
  counts: { color: "#d9d5e8", marginTop: 8, fontWeight: "700" },
  time: { color: "#8f8aa3", marginTop: 5, fontSize: 12 },
  row: { flexDirection: "row", paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: "#29243a" },
  status: { color: "#fff", width: 78, fontWeight: "800" },
  rowBody: { flex: 1 },
  name: { color: "#fff", fontWeight: "700" },
  detail: { color: "#aaa5ba", marginTop: 4, lineHeight: 19 },
  button: { marginTop: 24, padding: 15, borderRadius: 12, backgroundColor: "#28213d", alignItems: "center" },
  buttonText: { color: "#fff", fontWeight: "800" },
  footer: { color: "#777187", marginTop: 22, marginBottom: 30, fontSize: 12, lineHeight: 18 },
});
