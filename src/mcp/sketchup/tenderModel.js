export function buildTenderGridRuby(project) {
  if (!project || typeof project !== 'object' || Array.isArray(project)) {
    throw new Error('project must be the extracted tender project JSON object.');
  }

  const warnings = [];
  const xAxes = [];
  const yAxes = [];
  const seen = new Set();
  for (const grid of Array.isArray(project.grids) ? project.grids : []) {
    if (!grid || typeof grid.axis !== 'string' || !grid.axis.trim()) continue;
    if (!Number.isFinite(grid.coordinate_mm)) continue;

    let direction = String(grid.direction || '').toUpperCase();
    if (direction !== 'X' && direction !== 'Y') {
      direction = /^[A-Z]+$/i.test(grid.axis)
        ? 'X'
        : /^\d+$/.test(grid.axis)
          ? 'Y'
          : '';
      if (direction) {
        warnings.push(`Grid ${grid.axis}: inferred ${direction} direction from its axis label.`);
      }
    }
    if (!direction) {
      warnings.push(`Grid ${grid.axis}: skipped because its direction is ambiguous.`);
      continue;
    }

    const key = `${direction}:${grid.axis}:${grid.coordinate_mm}`;
    if (seen.has(key)) continue;
    seen.add(key);
    (direction === 'X' ? xAxes : yAxes).push({
      axis: grid.axis,
      coordinate_mm: grid.coordinate_mm
    });
  }

  if (xAxes.length < 2 || yAxes.length < 2) {
    throw new Error('At least two located X grid lines and two located Y grid lines are required to build a SketchUp grid scaffold.');
  }

  let levels = (Array.isArray(project.levels) ? project.levels : [])
    .filter((level) => level && Number.isFinite(level.elevation_mm))
    .map((level) => ({
      name: String(level.name || `Level ${level.elevation_mm}`),
      elevation_mm: level.elevation_mm
    }));
  if (!levels.length) {
    levels = [{ name: 'Datum (assumed)', elevation_mm: 0 }];
    warnings.push('No level elevations were extracted; scaffold placed at 0 mm datum.');
  }
  levels = Array.from(
    new Map(levels.map((level) => [`${level.name}:${level.elevation_mm}`, level])).values()
  ).sort((a, b) => a.elevation_mm - b.elevation_mm);

  warnings.push('Schedule elements were not placed because the tender JSON does not map marks to grid locations.');
  const payload = Buffer.from(JSON.stringify({
    projectName: String(project.project_name || 'Tender project'),
    xAxes,
    yAxes,
    levels,
    warnings
  }), 'utf8').toString('base64');

  const code = `require 'json'\nrequire 'base64'\n\ndata = JSON.parse(Base64.decode64('${payload}'))\nmodel = Sketchup.active_model\nraise 'No active SketchUp model.' unless model\n\nmodel.start_operation('Build tender grid scaffold', true)\nbegin\n  group = model.active_entities.add_group\n  group.name = "#{data['projectName']} - Tender Grid Scaffold"\n  entities = group.entities\n  materials = model.materials\n  x_material = materials['Tender Grid X'] || materials.add('Tender Grid X')\n  x_material.color = Sketchup::Color.new(190, 70, 55)\n  y_material = materials['Tender Grid Y'] || materials.add('Tender Grid Y')\n  y_material.color = Sketchup::Color.new(45, 105, 165)\n  level_material = materials['Tender Levels'] || materials.add('Tender Levels')\n  level_material.color = Sketchup::Color.new(45, 125, 85)\n  vertical_material = materials['Tender Vertical Grid'] || materials.add('Tender Vertical Grid')\n  vertical_material.color = Sketchup::Color.new(125, 135, 130)\n\n  mm_to_inches = ->(value) { value.to_f / 25.4 }\n  x_values = data['xAxes'].map { |axis| mm_to_inches.call(axis['coordinate_mm']) }\n  y_values = data['yAxes'].map { |axis| mm_to_inches.call(axis['coordinate_mm']) }\n  margin = [([x_values.max - x_values.min, y_values.max - y_values.min].max * 0.05), mm_to_inches.call(1000)].max\n  x_min = x_values.min - margin\n  x_max = x_values.max + margin\n  y_min = y_values.min - margin\n  y_max = y_values.max + margin\n  level_values = data['levels'].map { |level| mm_to_inches.call(level['elevation_mm']) }\n\n  data['levels'].each_with_index do |level, level_index|\n    z = level_values[level_index]\n    data['xAxes'].each do |axis|\n      x = mm_to_inches.call(axis['coordinate_mm'])\n      edge = entities.add_line(Geom::Point3d.new(x, y_min, z), Geom::Point3d.new(x, y_max, z))\n      edge.material = x_material\n      entities.add_text(axis['axis'], Geom::Point3d.new(x, y_min - margin * 0.15, z))\n    end\n    data['yAxes'].each do |axis|\n      y = mm_to_inches.call(axis['coordinate_mm'])\n      edge = entities.add_line(Geom::Point3d.new(x_min, y, z), Geom::Point3d.new(x_max, y, z))\n      edge.material = y_material\n      entities.add_text(axis['axis'], Geom::Point3d.new(x_min - margin * 0.15, y, z))\n    end\n\n    outline = [[x_min, y_min], [x_max, y_min], [x_max, y_max], [x_min, y_max]]\n    outline.each_with_index do |point, index|\n      following = outline[(index + 1) % outline.length]\n      edge = entities.add_line(Geom::Point3d.new(point[0], point[1], z), Geom::Point3d.new(following[0], following[1], z))\n      edge.material = level_material\n    end\n    entities.add_text(level['name'], Geom::Point3d.new(x_min, y_min, z))\n  end\n\n  if level_values.length > 1\n    data['xAxes'].each do |x_axis|\n      data['yAxes'].each do |y_axis|\n        x = mm_to_inches.call(x_axis['coordinate_mm'])\n        y = mm_to_inches.call(y_axis['coordinate_mm'])\n        level_values.each_cons(2) do |lower_z, upper_z|\n          edge = entities.add_line(Geom::Point3d.new(x, y, lower_z), Geom::Point3d.new(x, y, upper_z))\n          edge.material = vertical_material\n        end\n      end\n    end\n  end\n\n  model.commit_operation\n  model.active_view.zoom_extents\n  {\n    status: 'created',\n    group: group.name,\n    grid_lines_per_level: data['xAxes'].length + data['yAxes'].length,\n    grid_intersections: data['xAxes'].length * data['yAxes'].length,\n    levels: data['levels'],\n    warnings: data['warnings']\n  }\nrescue StandardError => error\n  model.abort_operation\n  raise error\nend`;

  return {
    code,
    xGridCount: xAxes.length,
    yGridCount: yAxes.length,
    levels,
    warnings
  };
}
