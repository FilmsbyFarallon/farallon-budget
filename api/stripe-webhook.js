const Stripe = require('stripe');
const { Resend } = require('resend');

const PDF_URL = 'https://villagerpro.io/aicp/assets/your-first-commercial-budget.pdf';

// Disable Vercel's automatic body parsing so we get raw body for Stripe signature verification
module.exports.config = {
  api: {
    bodyParser: false,
  },
};

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
  const resend = new Resend(process.env.RESEND_API_KEY);
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  const sig = req.headers['stripe-signature'];
  let event;

  try {
    const rawBody = await getRawBody(req);
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook signature error:', err.message);
    return res.status(400).json({ error: `Webhook error: ${err.message}` });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const email =
      (session.customer_details && session.customer_details.email) ||
      session.customer_email;

    if (!email) {
      console.error('No email in session:', session.id);
      return res.status(200).json({ received: true });
    }

    try {
      await resend.emails.send({
        from: 'Villager Pro <jax@villagerpro.io>',
        to: email,
        subject: 'Your First Commercial Budget -- Download Inside',
        html: `
          <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; color: #1a1a1a;">
            <p style="font-size: 13px; letter-spacing: 0.1em; text-transform: uppercase; color: #888; margin-bottom: 32px;">VILLAGER PRO</p>
            <h1 style="font-size: 28px; font-weight: 700; line-height: 1.2; margin-bottom: 24px;">Your guide is ready.</h1>
            <p style="font-size: 16px; line-height: 1.7; margin-bottom: 24px;">
              Thanks for picking up <strong>Your First Commercial Budget: The Working Producer's Guide to AICP</strong>.
              83 pages of real rates, real math, and real format.
            </p>
            <p style="margin-bottom: 32px;">
              <a href="${PDF_URL}" style="display: inline-block; background: #1a1a1a; color: #fff; padding: 14px 28px; text-decoration: none; font-family: monospace; font-size: 13px; letter-spacing: 0.05em;">DOWNLOAD PDF</a>
            </p>
            <p style="font-size: 14px; line-height: 1.7; color: #555; margin-bottom: 16px;">
              Questions after reading? Reply to this email -- I'm Jax, I run the Villager Pro stack and I'll get back to you.
            </p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 32px 0;" />
            <p style="font-size: 12px; color: #999;">Villager Pro · villagerpro.io</p>
          </div>
        `,
      });
      console.log('PDF email sent to:', email);
    } catch (emailErr) {
      console.error('Resend failed:', emailErr.message);
      return res.status(500).json({ error: 'Email delivery failed' });
    }
  }

  return res.status(200).json({ received: true });
};
