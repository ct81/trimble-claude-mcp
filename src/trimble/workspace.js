const workspaceApiGroups = [
  'dataTable',
  'embed',
  'extension',
  'markup',
  'modelsPanel',
  'project',
  'propertyPanel',
  'ui',
  'user',
  'view',
  'viewer'
];

function bindWorkspaceApi(api) {
  return new Proxy(api, {
    get(target, property) {
      const value = Reflect.get(target, property, target);
      return typeof value === 'function'
        ? value.bind(target)
        : value;
    }
  });
}

export function createWorkspaceClient(workspaceApi) {
  if (!workspaceApi || typeof workspaceApi !== 'object') {
    throw new TypeError('A Trimble Connect WorkspaceAPI instance is required');
  }

  const groups = Object.fromEntries(
    workspaceApiGroups.map((name) => [
      name,
      workspaceApi[name] && typeof workspaceApi[name] === 'object'
        ? bindWorkspaceApi(workspaceApi[name])
        : undefined
    ])
  );

  return Object.freeze({
    ...groups,

    call(groupName, methodName, ...args) {
      const group = groups[groupName];
      if (!group) {
        throw new Error(`Workspace API group is unavailable: ${groupName}`);
      }

      const method = group[methodName];
      if (typeof method !== 'function') {
        throw new Error(
          `Workspace API method is unavailable: ${groupName}.${methodName}`
        );
      }

      return method(...args);
    }
  });
}

export { workspaceApiGroups };