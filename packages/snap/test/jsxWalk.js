// SPDX-License-Identifier: Apache-2.0

/**
 * Walkers over the Snap's JSX dialog trees.
 *
 * Deliberately plain JavaScript rather than TypeScript, so that either test
 * runner can import it. vitest reads it directly. jest would resolve it through
 * the `^.+\.js$` babel-jest transform in jest.config.cjs, which declares no
 * TypeScript transform, and the @metamask/snaps-jest preset adds none, so a .ts
 * helper imported from a jest test fails with "Unexpected token 'export'".
 * Only the vitest suites import it today; the constraint is kept so the jest
 * dialog assertions can move from substring matching to structural walking
 * without a config change.
 *
 * A dialog node is {type, props, key}. Text carries its string in
 * props.children; Copyable carries it in props.value. Children may be a single
 * node, an array, or a bare string.
 */

/**
 * Collect every user-visible string in render order.
 *
 * Any node whose children are a plain string counts, which in practice means
 * Text and Heading. Restricting this to Text alone would silently return
 * nothing for a heading assertion, so the rule is about the shape of the node
 * rather than its name: a future element that renders a string is picked up
 * without editing this walker.
 *
 * Copyable values are NOT included, because they live in props.value rather
 * than props.children and asserting them is a different question. Use
 * copyables() for those.
 *
 * @param {unknown} node Dialog tree or subtree.
 * @param {string[]} out Accumulator.
 * @returns {string[]} Rendered strings, in order.
 */
export function texts(node, out = []) {
  if (node === null || node === undefined) return out;
  if (Array.isArray(node)) {
    for (const child of node) texts(child, out);
    return out;
  }
  // A bare string inside a children array is rendered text. Dropping it makes
  // negative assertions ("the dialog shows no amount") vacuous against any
  // node that mixes a literal with an inline element.
  if (typeof node === "string") {
    out.push(node);
    return out;
  }
  if (typeof node !== "object") return out;

  const props = node.props ?? {};
  if (typeof props.children === "string") {
    out.push(props.children);
  } else if (props.children !== undefined) {
    texts(props.children, out);
  }
  return out;
}

/**
 * Collect every Copyable value in render order.
 *
 * @param {unknown} node Dialog tree or subtree.
 * @param {string[]} out Accumulator.
 * @returns {string[]} Copyable values, in order.
 */
export function copyables(node, out = []) {
  if (node === null || node === undefined) return out;
  if (Array.isArray(node)) {
    for (const child of node) copyables(child, out);
    return out;
  }
  if (typeof node !== "object") return out;

  const props = node.props ?? {};
  if (node.type === "Copyable" && typeof props.value === "string") {
    out.push(props.value);
  }
  if (props.children !== undefined && typeof props.children !== "string") {
    copyables(props.children, out);
  }
  return out;
}

/**
 * Collect every element type in render order, so a test can assert structure
 * (that a Divider separates context from details, for instance).
 *
 * @param {unknown} node Dialog tree or subtree.
 * @param {string[]} out Accumulator.
 * @returns {string[]} Element type names, in order.
 */
export function types(node, out = []) {
  if (node === null || node === undefined) return out;
  if (Array.isArray(node)) {
    for (const child of node) types(child, out);
    return out;
  }
  if (typeof node !== "object") return out;

  if (typeof node.type === "string") out.push(node.type);
  const props = node.props ?? {};
  if (props.children !== undefined && typeof props.children !== "string") {
    types(props.children, out);
  }
  return out;
}
