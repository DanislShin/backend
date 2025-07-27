// server.js
const express = require("express");
const path = require("path");
const cors = require("cors");
const dotenv = require("dotenv");
const { OpenAI } = require("openai");
const supabase = require("./supabase");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "https://bestion.netlify.app");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.header("Access-Control-Allow-Credentials", "true");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

const corsOptions = {
  origin: [
    "https://bestion.netlify.app",
    "http://localhost:3000",
    "http://localhost:5173",
  ],
  methods: ["GET", "POST", "OPTIONS"], // OPTIONS 메서드 명시적 허용
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true, // 쿠키/인증 필요 시
};

app.use(cors(corsOptions));

// 2. OPTIONS 메서드 핸들러 추가 (라우트 전에 위치해야 함)
app.options("*", cors(corsOptions)); // 모든 OPTIONS 요청 처리

app.use(express.json());
app.use(express.static(path.join(__dirname, "frontend", "public")));

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

app.post("/review", async (req, res) => {
  const { sentence, input, user_id, module_code } = req.body;

  try {
    const prompt = `
영어 문장: "${sentence}"
사용자 한글 번역: "${input}"

아래 형식으로 한국어로 응답하세요. (JSON만), 총점 피드백에는 올바른 답을 적어주세요.:
{
  "문법": { "스코어": 85, "피드백": "..." },
  "단어 선택 및 문맥": { "스코어": 90, "피드백": "..." },
  "총점": { "스코어": 88, "피드백": "..." }
}

반드시 순수 JSON만 응답하세요. 다른 텍스트는 절대 포함하지 마세요.

    `;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.4,
    });

    const feedbackText = completion.choices[0].message.content;
    let feedback;
    try {
      feedback = JSON.parse(feedbackText);
    } catch (e) {
      throw new Error("OpenAI 응답이 JSON 형식이 아님");
    }

    const { error } = await supabase.from("practice_results").insert([
      {
        user_id,
        module_code,
        question_text: sentence,
        user_answer: input,
        ai_feedback: JSON.stringify(feedback),
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

// /api/save-result 엔드포인트 (기존 유지)
app.post("/api/save-result", async (req, res) => {
  const { user_id, module_code, results } = req.body;

  try {
    const insertPromises = results.map((result) =>
      supabase.from("practice_results").insert([
        {
          user_id,
          module_code,
          question_text: result.question_text,
          user_answer: result.user_answer,
          ai_feedback: JSON.stringify({ score: result.score }),
          timestamp: new Date().toISOString(),
        },
      ])
    );

    const results_array = await Promise.all(insertPromises);
    const errors = results_array.filter((result) => result.error);
    if (errors.length > 0) {
      console.error("Supabase 저장 실패:", errors);
      return res.status(500).json({
        success: false,
        message: "일부 결과 저장에 실패했습니다.",
      });
    }

    console.log(`✅ ${results.length}개 결과가 성공적으로 저장되었습니다.`);
    res.json({
      success: true,
      message: "결과가 성공적으로 저장되었습니다.",
      saved_count: results.length,
    });
  } catch (error) {
    console.error("API 처리 중 오류:", error);
    res.status(500).json({
      success: false,
      message: "서버 오류가 발생했습니다.",
    });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ 서버 실행 중: Port ${PORT}`);
});
