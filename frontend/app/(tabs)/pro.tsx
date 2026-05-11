const generateVariations = async () => {
  try {
    setLoadingVariations(true);

    const response = await fetch(
      `${BACKEND_URL}/generate-variations`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },

        body: JSON.stringify({
          title,
          description,
          platform: "Pinterest",
          productLink,
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.log(data);

      Alert.alert(
        "Variation Error",
        data.error ||
          "Failed to generate AI variations."
      );

      return;
    }

    if (
      !data.variations ||
      !Array.isArray(
        data.variations
      )
    ) {
      Alert.alert(
        "Variation Error",
        "Invalid AI response."
      );

      return;
    }

    setVariations(
      data.variations
    );

    Alert.alert(
      "AI Variations Ready",
      "Fresh AI campaign variations generated successfully."
    );
  } catch (err: any) {
    console.log(err);

    Alert.alert(
      "Variation Error",
      err.message ||
        "Failed to generate AI variations."
    );
  } finally {
    setLoadingVariations(false);
  }
};