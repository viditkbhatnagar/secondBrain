import { GraphNodeModel, GraphEdgeModel } from '../models/index';

export class GraphService {
  static async upsertNode(type: string, label: string, refId?: string, properties?: any): Promise<string> {
    const id = `${type}:${refId || label}`.toLowerCase();
    await GraphNodeModel.findOneAndUpdate(
      { id },
      { $set: { type, label, refId, properties, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
      { upsert: true }
    ).exec();
    return id;
  }

  static async upsertEdge(from: string, to: string, type: string, confidence?: number, properties?: any): Promise<string> {
    const id = `${from}->${type}->${to}`;
    await GraphEdgeModel.findOneAndUpdate(
      { id },
      { $set: { from, to, type, confidence, properties } },
      { upsert: true }
    ).exec();
    return id;
  }

  static async neighborhood(nodeId: string, hops: number = 1) {
    // naive 1-2 hop neighborhood over edges
    const edges = await GraphEdgeModel.find({ $or: [{ from: nodeId }, { to: nodeId }] }).lean();
    const nodeIds = new Set<string>([nodeId]);
    edges.forEach(e => { nodeIds.add(e.from); nodeIds.add(e.to); });
    if (hops > 1) {
      const edges2 = await GraphEdgeModel.find({ $or: [{ from: { $in: Array.from(nodeIds) } }, { to: { $in: Array.from(nodeIds) } }] }).lean();
      edges2.forEach(e => { nodeIds.add(e.from); nodeIds.add(e.to); });
    }
    const nodes = await GraphNodeModel.find({ id: { $in: Array.from(nodeIds) } }).lean();
    return { nodes, edges };
  }
}


