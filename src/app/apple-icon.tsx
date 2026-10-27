import { ImageResponse } from 'next/og'

export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 180,
          height: 180,
          background: '#D7FF10',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span style={{ fontSize: 120, fontWeight: 800, color: '#111110', fontFamily: 'sans-serif', letterSpacing: '-6px' }}>
          W
        </span>
      </div>
    ),
    { ...size }
  )
}
