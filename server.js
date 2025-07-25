const express = require("express");
const path = require("path");
const cors = require("cors");
const dotenv = require("dotenv");
const { OpenAI } = require("openai");
const supabase = require("./supabase");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(
  cors({
    origin: [
      "https://english-review-frontend.netlify.app",
      "http://localhost:3000",
      "null",
    ],
  })
);
app.use(express.json());
app.use(express.static(path.join(__dirname, "../frontend")));

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

app.post("/review", async (req, res) => {
  const { sentence, input, user_id, module_code } = req.body;

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

    // Supabase 저장
    const { error } = await supabase.from("practice_results").insert([
      {
        user_id,
        module_code,
        question_text: sentence,
        user_answer: input,
        ai_feedback: feedback,
        timestamp: new Date().toISOString(),
      },
    ]);

    if (error) {
      console.error("Supabase 저장 실패:", error);
    }

    res.json({ feedback });
  } catch (error) {
    console.error(error);
    res.status(500).json({ feedback: "AI 처리 중 오류가 발생했습니다." });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ 서버 실행 중: Port ${PORT}`);
});
