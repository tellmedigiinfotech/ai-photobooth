module.exports = async function handler(req, res) {
    res.json({
        status: "ok",
        apiKeyConfigured: !!process.env.GEMINI_API_KEY,
    });
};
