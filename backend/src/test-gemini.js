import dotenv from "dotenv";
dotenv.config();

import { GoogleGenerativeAI } from "@google/generative-ai";

console.log("Key prefix:", process.env.GEMINI_API_KEY?.slice(0, 15));

const genAI = new GoogleGenerativeAI(
  process.env.GEMINI_API_KEY
);

const model = genAI.getGenerativeModel({
  model: "gemini-1.5-flash",
});

try {
  const result = await model.generateContent("Reply with TEST");
  console.log("SUCCESS");
  console.log(result.response.text());
} catch (err) {
  console.error("ERROR:");
  console.error(err);
}