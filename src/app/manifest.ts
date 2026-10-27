import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'WDP Command Center',
    short_name: 'WDP',
    description: 'Weeknight Dinner Party Agentic COO',
    start_url: '/dashboard',
    display: 'standalone',
    background_color: '#D7FF10',
    theme_color: '#D7FF10',
    icons: [
      { src: '/icon.png', sizes: '32x32', type: 'image/png' },
      { src: '/apple-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  }
}
