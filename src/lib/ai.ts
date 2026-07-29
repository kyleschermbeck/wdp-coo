import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export type EmailCategory = 'wholesale_inquiry' | 'customer_retail' | 'press_collab' | 'admin_ops' | 'other'

export interface EmailAnalysis {
  category: EmailCategory
  priority: 1 | 2 | 3  // 1=urgent, 2=normal, 3=low
  summary: string
}

export interface UsageStats {
  input_tokens: number
  output_tokens: number
}

const CATEGORY_DESCRIPTIONS = `
- wholesale_inquiry: retailer or shop asking about carrying products, wholesale pricing, minimum orders, accounts
- customer_retail: individual customer orders, questions about products, shipping, returns
- press_collab: press coverage, influencer collabs, brand partnerships, gifting, features
- admin_ops: invoices, shipping logistics, supplier communications, legal, internal ops
- other: personal, spam, newsletters, unclear
`

const BUSINESS_CONTEXT = `
Weeknight Dinner Party is a small spice blend brand that sells 10 artisanal spice blends (like "Just Dill With It", "Make No Mis-Steak", "Let's Taco-Bout It"). They sell wholesale to retail stores and direct-to-consumer. The email address is hello@agoodworkstudio.com.
`

export async function analyzeEmail(
  subject: string,
  fromEmail: string,
  snippet: string,
  bodyText: string,
): Promise<{ analysis: EmailAnalysis; usage: UsageStats }> {
  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 256,
    messages: [{
      role: 'user',
      content: `You are helping organize emails for a small spice brand business.

${BUSINESS_CONTEXT}

Analyze this email and respond with ONLY valid JSON (no markdown, no explanation):
{
  "category": one of: wholesale_inquiry, customer_retail, press_collab, admin_ops, other,
  "priority": 1 (urgent - needs reply today), 2 (normal - reply within a few days), or 3 (low - FYI/no reply needed),
  "summary": one sentence max 100 chars describing what this email is about
}

Category guide:
${CATEGORY_DESCRIPTIONS}

Email:
From: ${fromEmail}
Subject: ${subject}
Body: ${(bodyText || snippet).slice(0, 1000)}`,
    }],
  })

  const usage: UsageStats = {
    input_tokens: response.usage.input_tokens,
    output_tokens: response.usage.output_tokens,
  }

  try {
    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    return { analysis: JSON.parse(text) as EmailAnalysis, usage }
  } catch {
    return {
      analysis: { category: 'other', priority: 2, summary: snippet.slice(0, 100) },
      usage,
    }
  }
}

export async function generateDraft(
  subject: string,
  fromName: string,
  fromEmail: string,
  bodyText: string,
): Promise<{ draft: string; usage: UsageStats }> {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: `You are drafting a reply email on behalf of Weeknight Dinner Party (hello@agoodworkstudio.com).

${BUSINESS_CONTEXT}

Write a warm, professional reply to this email. Match the brand voice: friendly, approachable, a little playful but not over the top. Do NOT include a subject line. Start directly with the greeting. End with a sign-off but do NOT include a name — just "Warmly," or similar.

Original email:
From: ${fromName} <${fromEmail}>
Subject: ${subject}
Body:
${bodyText.slice(0, 2000)}

Write only the email body — no explanations, no subject line, no metadata.`,
    }],
  })

  return {
    draft: response.content[0].type === 'text' ? response.content[0].text : '',
    usage: {
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
    },
  }
}
