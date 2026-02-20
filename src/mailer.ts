import nodemailer from "nodemailer";

export async function sendBriefing(subject: string, body: string): Promise<void> {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  const recipient = process.env.BRIEFING_RECIPIENT;

  if (!user || !pass || !recipient) {
    throw new Error("Missing GMAIL_USER, GMAIL_APP_PASSWORD, or BRIEFING_RECIPIENT env vars");
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
  });

  await transporter.sendMail({
    from: user,
    to: recipient,
    subject,
    text: body,
  });
}
