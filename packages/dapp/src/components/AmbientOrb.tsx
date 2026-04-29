interface AmbientOrbProps {
  color?: string;
  opacity?: number;
  size?: number;
  x?: string;
  y?: string;
}

export function AmbientOrb({
  color = "#00d4a4",
  opacity = 0.18,
  size = 840,
  x = "50%",
  y = "62%",
}: AmbientOrbProps) {
  return (
    <div
      className="orb"
      style={{
        width: size,
        height: size,
        left: x,
        top: y,
        transform: "translate(-50%, -50%)",
        background: `radial-gradient(circle, ${color}${Math.round(opacity * 255)
          .toString(16)
          .padStart(2, "0")} 0%, transparent 70%)`,
      }}
    />
  );
}
