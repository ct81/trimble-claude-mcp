function ids(vector) {
    if (!vector) return [];
    if (Array.isArray(vector)) return vector.map(item => typeof item === 'number' ? item : item.value);
    return Array.from({ length: vector.size() }, (_, index) => vector.get(index));
}

export function buildExplorerTree(api, modelID, filename, types) {
    const nodes = new Map();
    const children = new Map();
    const parented = new Set();
    const addNode = id => {
        if (!Number.isInteger(id) || nodes.has(id)) return;
        const line = api.GetLine(modelID, id, false);
        if (!line) return;
        const type = api.GetNameFromTypeCode(api.GetLineType(modelID, id)) || 'IFCUNKNOWN';
        nodes.set(id, { id, type, name: String(line.Name?.value || `${type} #${id}`) });
    };
    for (const type of [types.project, types.product]) {
        for (const id of ids(api.GetLineIDsWithType(modelID, type, true))) addNode(id);
    }
    for (const [type, parentField, childrenField] of [
        [types.aggregates, 'RelatingObject', 'RelatedObjects'],
        [types.nests, 'RelatingObject', 'RelatedObjects'],
        [types.contains, 'RelatingStructure', 'RelatedElements']
    ]) {
        for (const relID of ids(api.GetLineIDsWithType(modelID, type))) {
            const rel = api.GetLine(modelID, relID, false);
            const parent = rel?.[parentField]?.value;
            if (!Number.isInteger(parent)) continue;
            addNode(parent);
            for (const child of ids(rel[childrenField])) {
                if (!Number.isInteger(child) || child === parent) continue;
                addNode(child);
                if (!nodes.has(parent) || !nodes.has(child) || parented.has(child)) continue;
                if (!children.has(parent)) children.set(parent, []);
                children.get(parent).push(child);
                parented.add(child);
            }
        }
    }

    const visited = new Set();
    const makeGroups = nodeIds => {
        const groups = new Map();
        for (const id of nodeIds) {
            if (visited.has(id)) continue;
            visited.add(id);
            const node = nodes.get(id);
            const item = { ...node, children: makeGroups(children.get(id) || []) };
            if (!groups.has(node.type)) groups.set(node.type, []);
            groups.get(node.type).push(item);
        }
        return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([type, items]) => ({
            name: `${type.replace(/^IFC/i, '')} (${items.length})`,
            children: items.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
        }));
    };
    const roots = [...nodes.keys()].filter(id => !parented.has(id));
    const tree = { name: filename, children: makeGroups(roots) };
    tree.children.push(...makeGroups([...nodes.keys()]));
    return tree;
}
