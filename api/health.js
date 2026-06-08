module.exports = async function handler(req, res) {
    const geminiConfigured = !!process.env.GEMINI_API_KEY;
    const replicateConfigured = !!process.env.REPLICATE_API_TOKEN;
    res.json({
        status: "ok",
        apiKeyConfigured: geminiConfigured && replicateConfigured,
        geminiConfigured,
        replicateConfigured,
    });
};
