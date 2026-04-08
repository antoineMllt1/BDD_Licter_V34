import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const SYSTEM_PROMPT = `Tu es un assistant analytique pour Fnac Darty Intelligence. Tu analyses les données de 6 modules du dashboard et fournis des insights actionnables aux équipes COMEX et Marketing.

MODULES DISPONIBLES DANS LE CONTEXTE :
- snapshot : santé de marque globale, score, niveau de crise, position vs Boulanger, éditorial
- warRoom : social media (mentions, engagement, auteurs à risque), réputation (cas ouverts, backlog sans réponse)
- battleMatrix : benchmark concurrentiel par dimension (gagnées/perdues vs Boulanger), part de voix
- voixClient : irritants clients, satisfactions, parcours critique, verbatims (Fnac Darty + Boulanger)
- actionCenter : actions urgentes et différables avec owner et impact business
- magasins : réseau Google Reviews, notes par magasin, risque par ville
- couvertureDonnees : volume et fraîcheur des données

RÈGLES DE FORMAT STRICTES :
- Maximum 4-5 lignes. Pas d'intro, pas de conclusion.
- Listes : "• point" uniquement. Pas de tiret, pas de markdown.
- Zéro markdown : pas de **, ##, _, ni emojis.
- Commence directement par la réponse.
- Ne mentionne JAMAIS les données vides ou à zéro. Utilise uniquement ce qui est disponible.
- Si une métrique est disponible, cite le chiffre exact.`

export async function chat(req, res) {
  const { message, context } = req.body

  if (!message) {
    return res.status(400).json({ error: 'Message requis' })
  }

  const contextBlock = context
    ? `\n\n--- DONNÉES DASHBOARD EN TEMPS RÉEL ---\n${JSON.stringify(context, null, 2)}\n--- FIN DONNÉES ---\n`
    : ''

  try {
    const response = await client.messages.create({
      model: process.env.ANTHROPIC_CHAT_MODEL || 'claude-haiku-4-5-20251001',
      max_tokens: 350,
      system: SYSTEM_PROMPT + contextBlock,
      messages: [{ role: 'user', content: message }],
    })

    const text = response.content?.[0]?.text || ''
    res.json({ reply: text })
  } catch (err) {
    console.error('[chat] Anthropic error:', err.message)
    res.status(500).json({ error: 'Erreur lors de la génération de la réponse' })
  }
}
