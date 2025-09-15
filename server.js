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
      "https://bestion.netlify.app",
      "http://localhost:3000",
      "http://localhost:5173",
      "null",
    ],
  })
);
app.use(express.json());
app.use(express.static(path.join(__dirname, "frontend", "public")));

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

app.post("/review", async (req, res) => {
  const { sentence, input, user_id, module_code, language } = req.body; // ★ language 추가

  try {
    const prompt = `
영어 문장: "${sentence}"
사용자 한글 번역: "${input}"

사용자의 한글 번역을 엄격히 평가하여 아래 형식으로 한국어로 응답하세요. (JSON만 반환)
{
  "종합 평가": { "스코어": 0, "피드백": "..." }
}

### 평가 지침
- **종합 평가**: 문법, 단어 선택, 문맥을 통합적으로 평가.
  - 완벽한 번역: 90~100점.
  - 사소한 오류(문법/단어 약간 부정확): 70~89점.
  - 중대한 오류(의미 왜곡, 문장 구조 파괴): 50~69점.
  - 완전히 틀리거나 빈칸: 0~49점.
- **감점 기준**:
  - 사소한 문법/단어 오류: 1~5점 감점.
  - 의미 왜곡 또는 심각한 문법 오류: 10~20점 감점.
  - 빈칸 또는 공백만 있는 입력: 0점, 피드백에 "입력 없음" 명시.
- **피드백**: 최대 30자로 간결히 작성. 올바른 번역 예시를 포함.
- 반드시 순수 JSON만 반환하며, 다른 텍스트는 절대 포함하지 마세요.
    `;

    const completion = await openai.chat.completions.create({
      model: "gpt-5-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
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
        language, // ★ language 추가
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

app.post("/api/save-result", async (req, res) => {
  const { user_id, module_code, results, language } = req.body; // ★ language 추가

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
          language, // ★ language 추가
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

    // learning_progress 업데이트
    const { error: progressError } = await supabase
      .from("learning_progress")
      .insert([
        {
          user_id,
          module_code,
          completed: true,
          language, // ★ language 추가
        },
      ]);

    if (progressError) {
      console.error("learning_progress 저장 실패:", progressError);
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
