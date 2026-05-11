import type { Handler } from "@netlify/functions";
import { Resend } from "resend";

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const { email, name, score, status, date, resendKey, resendFromEmail } = body;

    const key = resendKey || process.env.RESEND_API_KEY;
    if (!key) {
      return { statusCode: 400, body: JSON.stringify({ error: "No Resend key provided" }) };
    }
    if (!email) {
      return { statusCode: 400, body: JSON.stringify({ error: "Missing email" }) };
    }

    const resend = new Resend(key);
    const fromAddress =
      resendFromEmail || process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";

    const passed = status === "Passed";
    const statusColor = passed ? "#10b981" : "#ef4444";
    const statusText = passed ? "نجاح" : "عدم اجتياز";

    const html = `
      <div dir="rtl" style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; color: #333; line-height: 1.6; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden; padding-bottom: 20px;">
        <div style="background-color: #0f172a; padding: 30px 20px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 24px;">نتائج تقييم تورنكس</h1>
        </div>
        <div style="padding: 30px 20px;">
          <p style="font-size: 18px; font-weight: bold; margin-top: 0;">مرحباً ${name}،</p>
          <p>تم الانتهاء من جلسة التقييم الخاصة بك. وإليك التفاصيل:</p>

          <div style="background-color: #f8fafc; border-radius: 8px; padding: 20px; margin: 25px 0; border-right: 4px solid ${statusColor};">
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px 0; font-weight: bold; color: #64748b;">تاريخ التقييم:</td>
                <td style="padding: 8px 0; text-align: left;">${date}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; font-weight: bold; color: #64748b;">الدرجة التقنية:</td>
                <td style="padding: 8px 0; text-align: left; font-size: 18px; font-weight: bold;">${score}%</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; font-weight: bold; color: #64748b;">الحالة:</td>
                <td style="padding: 8px 0; text-align: left; font-weight: bold; color: ${statusColor};">${statusText}</td>
              </tr>
            </table>
          </div>

          <p style="color: #64748b; font-size: 14px; margin-top: 30px; text-align: center;">شكراً لاستخدامك منصة تورنكس</p>
        </div>
      </div>
    `;

    const { data, error } = await resend.emails.send({
      from: `Tornix Assessment <${fromAddress}>`,
      to: [email],
      subject: `نتيجة تقييم تورنكس - ${name}`,
      html,
    });

    if (error) {
      return { statusCode: 400, body: JSON.stringify(error) };
    }

    return { statusCode: 200, body: JSON.stringify({ success: true, data }) };
  } catch (err) {
    console.error("Email sending error:", err);
    return { statusCode: 500, body: JSON.stringify({ error: "Internal server error" }) };
  }
};
