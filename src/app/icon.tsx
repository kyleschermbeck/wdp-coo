import { ImageResponse } from 'next/og'

export const size = { width: 32, height: 32 }
export const contentType = 'image/png'

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 32,
          height: 32,
          background: '#D7FF10',
          borderRadius: 7,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span style={{ fontSize: 20, fontWeight: 800, color: '#111110', fontFamily: 'sans-serif', letterSpacing: '-1px' }}>
          W
        </span>
      </div>
    ),
    { ...size }
  )
}
