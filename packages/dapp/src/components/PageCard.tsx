import type { ReactNode } from "react";
import { cn } from "../lib/cn";
import styles from "./PageCard.module.css";

interface Props {
  children: ReactNode;
  className?: string;
}

export function PageCard({ children, className }: Props) {
  return <div className={cn(styles.card, className)}>{children}</div>;
}
