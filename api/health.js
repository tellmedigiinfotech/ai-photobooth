module.exports = async function handler(req, res) {
    // Runtime deps: OpenAI powers per-user scene generation (gpt-image-2) and
    // Replicate powers the face-swap finisher. Both are essential.
    const openaiConfigured = !!process.env.OPENAI_API_KEY;
    const replicateConfigured = !!process.env.REPLICATE_API_TOKEN;
    res.json({
        status: "ok",
        apiKeyConfigured: openaiConfigured && replicateConfigured,
        openaiConfigured,
        replicateConfigured,
    });
};
