import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const apiKey = process.env.RECIPEKIT_API_KEY
  if (!apiKey) {
    return NextResponse.json({
      error: 'RECIPEKIT_API_KEY is not set. Add it to .env.local to push recipes to RecipeKit.',
    }, { status: 503 })
  }

  const { recipe_name, ingredients, about, why, steps, considerations, nutrition, keywords } = await req.json()

  if (!recipe_name?.trim()) {
    return NextResponse.json({ error: 'Recipe name is required.' }, { status: 400 })
  }

  // Combine about + why into a single description
  const description = [about, why].filter(Boolean).join('\n\n')

  const res = await fetch('https://app.recipekit.app/api/v1/recipes', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      title: recipe_name,
      description,
      ingredients: ingredients.split('\n').filter(Boolean),
      instructions: steps.split('\n').filter(Boolean),
      notes: considerations,
      nutrition,
      keywords,
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    return NextResponse.json({ error: `RecipeKit error ${res.status}: ${text}` }, { status: 502 })
  }

  const data = await res.json()
  return NextResponse.json({ recipe_kit_id: String(data.id ?? 'pushed') })
}
