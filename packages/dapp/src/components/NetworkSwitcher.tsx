import { NETWORKS } from "../lib/config";
import styles from "./NetworkSwitcher.module.css";

interface Props {
  current: string;
  onSelect: (id: string) => void;
}

export function NetworkSwitcher({ current, onSelect }: Props) {
  return (
    <div className="dropdown" style={{ minWidth: 288 }}>
      <p className={`dropdown-section-label ${styles.header}`}>SWITCH NETWORK</p>
      {NETWORKS.map((net) => (
        <div
          key={net.id}
          className={`network-item ${net.id === current ? "selected" : ""}`}
          onClick={() => onSelect(net.id)}
        >
          <span className="network-dot" style={{ background: net.color }} />
          <div>
            <p
              style={{
                fontSize: 13,
                fontWeight: net.id === current ? 700 : 600,
                color: "var(--text-primary)",
              }}
            >
              {net.name}
            </p>
            <p style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>{net.host}</p>
          </div>
          {net.id === current && (
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              style={{ marginLeft: "auto" }}
            >
              <path
                d="M2 8 L6 12 L14 4"
                stroke="#ffb84d"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </div>
      ))}
    </div>
  );
}
