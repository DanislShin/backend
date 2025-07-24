const express = require("express");
const path = require("path");
const cors = require("cors");
const dotenv = require("dotenv");
const { OpenAI } = require("openai");

dotenv.config();

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

app.post("/review", async (req, res) => {
  const { sentence, input } = req.body;

  try {
    const prompt = `
영어 문장: "${sentence}"
사용자 해설: "${input}"

위 해설이 해당 문장을 정확히 이해했는지 평가해줘. 잘못된 부분이 있다면 정확히 짚어주고, 이해도가 높다면 칭찬과 함께 보완할 점을 알려줘. 한국어로 친절하게 설명해줘.
`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.4,
    });

    const feedback = completion.choices[0].message.content;
    res.json({ feedback });
  } catch (error) {
    console.error(error);
    res.status(500).json({ feedback: "AI 처리 중 오류가 발생했습니다." });
  }
});

app.listen(PORT, () => {
  console.log(`✅ 로컬 서버 실행 중: http://localhost:${PORT}`);
});
