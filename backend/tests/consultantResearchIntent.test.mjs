import test from "node:test";
import assert from "node:assert/strict";
import { needsCreativeWebResearch } from "../services/consultantResearchIntent.js";

test("current creative discipline questions request sourced web research", () => {
  for (const question of [
    "What are the latest photography trends?",
    "What are current videography platform requirements?",
    "What changed in tattooing rules this year?",
    "What are the latest pottery trends?",
    "What is new in woodworking crafts this month?",
    "What are current Instagram algorithm changes?",
  ]) assert.equal(needsCreativeWebResearch(question), true, question);
});

test("evergreen questions and account status do not require web research", () => {
  for (const question of [
    "How do I blend acrylic paint?",
    "How do I light a portrait?",
    "Did I have any failed posts today?",
    "Do any of my automations have errors?",
    "",
  ]) assert.equal(needsCreativeWebResearch(question), false, question);
});

test("noncreative current questions do not trigger creative research", () => {
  assert.equal(needsCreativeWebResearch("What is the weather today?"), false);
});
