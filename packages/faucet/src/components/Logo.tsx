// SPDX-License-Identifier: Apache-2.0

export function Logo() {
  return (
    <img
      src={`${import.meta.env.BASE_URL}chainsafe-logo.png`}
      alt="ChainSafe"
      width={32}
      height={32}
      style={{ display: "block", width: "100%", height: "100%", objectFit: "contain" }}
    />
  );
}
