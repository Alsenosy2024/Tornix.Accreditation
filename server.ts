import express from "express";
import path from "path";
import { Resend } from "resend";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());

app.post("/api/send-email", async (req, res) => {
  try {
    const { email, name, score, status, date, resendKey, resendFromEmail } = req.body;
    
    if (!resendKey) {
      return res.status(400).json({ error: "No Resend key provided" });
    }

    const resend = new Resend(resendKey);
    const fromAddress = resendFromEmail || 'onboarding@resend.dev';
    
    // Customize email based on whether they passed or failed
    const passed = status === "Passed";
    const statusColor = passed ? "#10b981" : "#ef4444";
    const statusText = passed ? (/*ar*/ "نجاح") : (/*ar*/ "عدم اجتياز");
    
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
      html: html,
    });

    if (error) {
      return res.status(400).json(error);
    }

    res.status(200).json({ success: true, data });
  } catch (error) {
    console.error("Email sending error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(Number(PORT), "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
