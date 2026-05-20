// api/anaes-ai/assist.ts
// Vercel serverless function — handles all AI requests

import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const SYSTEM_PROMPTS: Record<string, string> = {
  chat: `You are an expert consultant anaesthetist assistant working in a UK NHS hospital (Oxford University Hospitals).
You provide accurate, evidence-based clinical information following UK guidelines (RCoA, AAGBI, NICE, BNF).
Always be concise and clinically relevant. Use UK drug names and spellings.
Format responses clearly with headers where helpful.
Always add a brief disclaimer reminding the user to apply their own clinical judgement.`,

  drug_advice: `You are an expert consultant anaesthetist specialising in pharmacology.
Provide accurate drug information using UK guidelines and BNF dosing.
Always specify: dose, route, weight-based calculation where relevant, contraindications, and monitoring.
Use UK drug names (e.g. adrenaline not epinephrine, paracetamol not acetaminophen).
Flag any important interactions or cautions.
Add a brief disclaimer to verify with current BNF/guidelines.`,

  preop_summary: `You are a consultant anaesthetist performing a pre-operative assessment review.
You will be given structured patient data. Provide a concise, clinically focused summary covering:
1. Key anaesthetic concerns and risk factors
2. Optimisation recommendations if any
3. Suggested anaesthetic technique considerations
4. Specific monitoring or precautions
5. Post-operative care considerations
Follow UK RCoA/AAGBI guidelines. Be concise. 
Add a disclaimer that this is AI-assisted and clinical judgement must be applied.`,

  handover_review: `You are a consultant anaesthetist reviewing a post-operative handover note.
Identify any gaps, missing information, or concerns.
Check for: airway management documentation, fluid balance, analgesia plan, post-op targets,
escalation plan, specific monitoring requirements, and any unresolved intraoperative issues.
Be constructive and specific. Flag anything that could compromise patient safety.
Add a disclaimer that this is AI-assisted review only.`,
};

function buildPatientContext(patientContext: string): string {
  try {
    const pt = JSON.parse(patientContext);
    const po = pt.preop || {};
    const io = pt.io || {};
    return [
      "═══ PATIENT CONTEXT ═══",
      `Name: ${pt.name || "—"} | Age: ${pt.age || "—"}y | Sex: ${pt.sex === "M" ? "Male" : "Female"} | ASA: ${pt.asa || "—"}`,
      `Procedure: ${pt.surgery || "—"} | Technique: ${pt.technique || "—"}`,
      pt.weight ? `Weight: ${pt.weight}kg | Height: ${pt.height || "—"}cm` : "",
      pt.allergies ? `⚠ ALLERGIES: ${pt.allergies}` : "Allergies: NKDA",
      pt.medHistory ? `PMH: ${pt.medHistory}` : "",
      pt.medications ? `Medications: ${pt.medications}` : "",
      pt.airway ? `Airway assessment: ${pt.airway}` : "",
      po.hb ? `Haematology — Hb: ${po.hb} g/dL | Plt: ${po.plt || "—"} | WCC: ${po.wcc || "—"}` : "",
      po.inr ? `Coagulation — INR: ${po.inr} | APTT: ${po.aptt || "—"} s` : "",
      po.creatinine ? `Biochemistry — Na: ${po.na || "—"} | K: ${po.k || "—"} | Creatinine: ${po.creatinine} µmol/L | eGFR: ${po.egfr || "—"}` : "",
      po.ecgResult ? `ECG (${po.ecgDate || "—"}): ${po.ecgResult}` : "",
      po.echoFindings ? `Echo (${po.echoDate || "—"}): EF ${po.echoEF || "—"}% — ${po.echoFindings}` : "",
      po.nsqipDone ? `NSQIP risk calculated` : "",
      io.airwayType ? `Airway used: ${io.airwayType}${io.tubeSize ? ` ${io.tubeSize}mm` : ""}${io.clGrade ? ` CL Grade ${io.clGrade}` : ""}${io.bougie ? " | Bougie" : ""}${io.vlary ? " | VL" : ""}` : "",
      io.crystVol ? `Fluids: ${io.crystType} ${io.crystVol}ml${io.collVol ? ` + ${io.collType} ${io.collVol}ml` : ""} | EBL: ${io.ebl || "—"}ml | Urine: ${io.urine || "—"}ml` : "",
      io.rbc ? `Blood products: pRBC ${io.rbc}u${io.ffp ? ` FFP ${io.ffp}u` : ""}${io.plt ? ` Plt ${io.plt}u` : ""}` : "",
      io.hbEnd ? `Hb end of case: ${io.hbEnd} g/dL${io.lactate ? ` | Lactate: ${io.lactate} mmol/L` : ""}` : "",
      io.analgesia ? `Intraop analgesia: ${io.analgesia}` : "",
      io.regional ? `Regional: ${io.regional}` : "",
      io.regAnalgesia ? `Post-op regular analgesia: ${io.regAnalgesia}` : "",
      io.rescAnalgesia ? `Rescue analgesia: ${io.rescAnalgesia}` : "",
      io.inotropes && io.inotropeDetails ? `Vasopressors: ${io.inotropeDetails}` : "",
      "═══════════════════════",
    ].filter(Boolean).join("\n");
  } catch {
    return "";
  }
}

export default async function handler(req: Request): Promise<Response> {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { mode = "chat", prompt, patientContext } = await req.json();

  if (!prompt?.trim()) {
    return new Response(JSON.stringify({ error: "No prompt provided" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Build message with optional patient context
  let userMessage = prompt;
  if (patientContext) {
    const ctx = buildPatientContext(patientContext);
    if (ctx) userMessage = `${ctx}\n\n${prompt}`;
  }

  const systemPrompt = SYSTEM_PROMPTS[mode] || SYSTEM_PROMPTS.chat;

  // Create a streaming response
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const anthropicStream = anthropic.messages.stream({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1024,
          system: systemPrompt,
          messages: [{ role: "user", content: userMessage }],
        });

        for await (const event of anthropicStream) {
          if (
            event.type === "content_block_delta" &&
            event.delta?.type === "text_delta"
          ) {
            const data = `data: ${JSON.stringify({ content: event.delta.text })}\n\n`;
            controller.enqueue(encoder.encode(data));
          }
        }

        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`));
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unknown error";
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ content: `\n\n⚠️ Error: ${message}` })}\n\n`)
        );
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

export const config = {
  runtime: "edge",
};
