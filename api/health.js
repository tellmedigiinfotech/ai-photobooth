module.exports = async function handler(req, res) {
    // Runtime deps: Replicate powers the face-swap (essential); OpenAI powers
    // the body-build classifier (optional — the app defaults to "average").
    // Scene generation is now offline (frozen templates), so Gemini/OpenAI image
    // generation is NOT a runtime dependency.
    const replicateConfigured = !!process.env.REPLICATE_API_TOKEN;
    const openaiConfigured = !!process.env.OPENAI_API_KEY;
    res.json({
        status: "ok",
        apiKeyConfigured: replicateConfigured, // the booth works as long as the swap can run
        replicateConfigured,
        openaiConfigured,
    });
};
