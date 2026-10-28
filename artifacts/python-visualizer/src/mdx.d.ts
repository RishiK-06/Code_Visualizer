declare module "*.mdx" {
  import type { ComponentType } from "react";

  const content: ComponentType;
  export default content;
}
