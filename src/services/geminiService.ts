import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export interface GeneratedQuestion {
  id: number;
  type: 'multiple-choice' | 'scenario' | 'evm' | 'visual' | 'management';
  category: string;
  question: string;
  options: string[];
  correctAnswer: number;
  explanation: string;
}

const SYSTEM_PROMPT = `
You are the Chief Assessment Architect for "Tornix Integrated Project Management". 
A highly detailed video and a presentation deck about the Tornix platform were analyzed to create this assessment. You MUST generate questions that reflect deep, precise knowledge of the Tornix interfaces and capabilities.

CRITICAL CONSTRAINTS:
1. RATIO: 15% on Global PM Theory (PMI/PMBOK standard) and 85% on Deep Tornix Platform Operations (from the analysis).
2. TORNIX CONTEXT (MUST USE THESE EXACT FEATURES AND STATS):
   - The First AI-Native Construction Platform: Tornix isn't just another PM tool, AI is the foundation. It boasts 15 Integrated Modules, 80% AI-Powered features, 6 AI Agents, and 95% BOQ Accuracy.
   - The 6 AI Agents: Cost Estimator, Safety Officer, Scheduler, Quality Inspector, Procurement, and Supervisor.
   - Tornix vs Competitors: Tornix scores 10/10 compared to P6, MS Project, Procore, and Monday. It explicitly supports AI Scheduling, Monte Carlo, AI Risk Detection, CPM, EVM, P6 Import/Export, and full Arabic RTL.
   - Benefits of Tornix: Reduces project delays by 40% (via Critical Path and Monte Carlo), cuts costs with smart forecasting (EVM), and saves 60% scheduling time.
   - Modules & Capabilities:
      - 15 Modules in total with AI embedded in 12.
      - Core Modules: Dashboard (Portfolio Health SPI/CPI), Projects (Project Creation, AI Memory), Gantt Chart (AI Schedule Generation, Critical Path, Dependencies FS/SS/FF/SF), Strategy Hub (Balanced Scorecard, OKRs, KPIs).
      - Execution Modules: AI Agents, BOQ Extraction (95%+ accuracy for Arabic/English PDFs), Documents (AI Document Canvas), Tasks, Chat & AI, Timeline/Calendar.
      - Finance & Risk: Risk & Issues (Matrix, AI Risk Detection), Requests, Procurement (AI Vendor Matching, Automated RFQs), Cost Management (Real-time EVM, SPI, EAC).
   - PMO & Strategy (C-Level Command Center): Executive Overview features Health Pulse, Strategic Process, and Risks Radar. Strategy Hub connects Balanced Scorecard, OKRs, KPIs, and AI Insights.
3. LANGUAGE: Base on user request. When using Arabic, MUST use highly professional engineering and PM terminology.
4. FORMAT: The output MUST be a JSON array matching exactly the GeneratedQuestion interface.
5. RANDOMIZATION: You MUST randomize the correctAnswer index (0-3) across all questions. Do not favor any specific letter (like B). Ensure answers are distributed evenly across A, B, C, D.
6. SCENARIOS: Create deeply contextual, complex scenarios. Every "Correct Answer" option MUST be a complete, descriptive explanation (at least 10-15 words) rather than a single word or short phrase. This ensures that if the question is converted to an essay, there is a substantial reference for the AI to validate against.
7. ESSAY SUITABILITY: Ensure questions ask "How", "Why", or "What is the impact of..." to encourage descriptive writing.
`;

export async function generateQuizQuestions(language: 'ar' | 'en' = 'ar'): Promise<GeneratedQuestion[]> {
  const languageInstruction = language === 'ar' 
    ? 'Use professional Arabic (Tajawal font ready) with correct PM terminology.' 
    : 'Use professional English with standard PMBOK/PMI terminology.';

  const prompt = `Generate 20 unique and challenging questions in ${language === 'ar' ? 'Arabic' : 'English'}. 
  ${languageInstruction}
  The output MUST be a JSON array.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        systemInstruction: SYSTEM_PROMPT + `\nLANG_MODE: ${language === 'ar' ? 'Arabic' : 'English'}\n` + languageInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.NUMBER },
              type: { 
                type: Type.STRING, 
                enum: ['multiple-choice', 'scenario', 'evm', 'visual', 'management'] 
              },
              category: { type: Type.STRING },
              question: { type: Type.STRING },
              options: { 
                type: Type.ARRAY, 
                items: { type: Type.STRING },
                minItems: 4,
                maxItems: 4
              },
              correctAnswer: { type: Type.NUMBER, description: "Index (0-3)" },
              explanation: { type: Type.STRING }
            },
            required: ['id', 'type', 'category', 'question', 'options', 'correctAnswer', 'explanation']
          }
        }
      }
    });

    if (!response.text) throw new Error("No response text from Gemini");
    
    const questions = JSON.parse(response.text) as GeneratedQuestion[];
    return questions.map((q, idx) => ({ ...q, id: idx + 1 }));
  } catch (error) {
    console.error("Error generating questions:", error);
    throw error;
  }
}
