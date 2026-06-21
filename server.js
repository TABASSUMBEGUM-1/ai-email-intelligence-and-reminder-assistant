require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();

app.use(cors());

app.use(express.json());

if(!process.env.GEMINI_API_KEY){
    console.error("⚠️  Missing GEMINI_API_KEY in environment variables.");
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Home Route
app.get("/", (req, res) => {
    res.send("Backend Running 🚀");
});

// Analyze Email Route
app.post("/analyze", async (req, res) => {
    try {
        const { email } = req.body;

        if(!email || typeof email !== "string" || !email.trim()){
            return res.status(400).json({ error: "Email content is required." });
        }

        const model = genAI.getGenerativeModel({
            model: "gemini-2.5-flash"
        });

        const result = await model.generateContent(`
Analyze this email carefully.

Email:
${email}

Return ONLY in the exact format below:

Title: [short title]

Category: [Hackathon / Internship / Workshop / Meeting / HR Update / Fee Payment / General]

Task: [main action required]

Deadline: [deadline if available, otherwise Not Mentioned]

Priority: [number from 1 to 100]

Summary: [one short sentence]

Rules:
- Keep title under 8 words.
- Keep summary under 15 words.
- Do not use markdown.
- Do not add extra explanations.
- Return only these 6 fields.
- Priority above 80 means urgent.
- Priority between 50 and 80 means important.
- Priority below 50 means informational.
`);

        res.json({
            response: result.response.text()
        });

    } catch (error) {
        console.log(error);

        res.status(500).json({
            error: "Failed to analyze email"
        });
    }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});