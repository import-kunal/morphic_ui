"use client";

import type { ReactNode } from "react";
import { useMorphicContext } from "./MorphicProvider";
import { ErrorBoundary } from "./ErrorBoundary";
import type { ElementNode, ComponentRendererProps } from "../engine/types";

interface Props {
  node: ElementNode;
}

function ComponentInvocation({
  renderer,
  rendererProps,
}: {
  renderer: (props: ComponentRendererProps) => ReactNode;
  rendererProps: ComponentRendererProps;
}): ReactNode {
  return renderer(rendererProps);
}

// Per-node renderer. Looks up the component definition from the library,
// wraps it in an ErrorBoundary, and passes evaluated props + renderNode callback.
export function RenderNode({ node }: Props): ReactNode {
  const { library, renderNode, triggerAction } = useMorphicContext();

  // Placeholder nodes produced by the resolver/streaming — render nothing.
  if (
    node.typeName === "__Unresolved__" ||
    node.typeName === "__Error__" ||
    node.typeName === "__Value__"
  ) {
    return null;
  }

  const compDef = library.components[node.typeName];
  if (!compDef) return null;

  const renderer = compDef.component as (
    props: ComponentRendererProps
  ) => ReactNode;

  return (
    <ErrorBoundary statementId={node.statementId} resetKey={node}>
      <ComponentInvocation
        renderer={renderer}
        rendererProps={{
          props: node.props,
          renderNode,
          triggerAction,
          statementId: node.statementId,
        }}
      />
    </ErrorBoundary>
  );
}
