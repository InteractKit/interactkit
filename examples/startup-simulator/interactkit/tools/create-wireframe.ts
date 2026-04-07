import type { DesignerEntity, DesignerCreateWireframeInput } from '../.generated/types.js';

export default async (entity: DesignerEntity, input: DesignerCreateWireframeInput): Promise<void> => {
  entity.state.wireframeCount++;
  await entity.refs.designSystem.saveAsset({ name: input.name, type: 'wireframe', content: input.svg });
};
