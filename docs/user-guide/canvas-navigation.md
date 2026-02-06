# Canvas Navigation

The Canvas UI provides a visual way to organize and explore your Intent Atoms.

## Overview

The canvas is an infinite 2D space where atoms are represented as draggable nodes. You can:

- Pan and zoom to navigate
- Drag atoms to organize them spatially
- View atom details by clicking
- Create new atoms directly on the canvas

## Canvas Controls

### Navigation

| Action | Mouse | Keyboard |
|--------|-------|----------|
| Pan | Click and drag on background | Arrow keys |
| Zoom | Mouse wheel | `+` / `-` |
| Fit all | - | `F` |
| Reset view | - | `0` |

### Atom Nodes

Each atom is displayed as a card showing:

- **Atom ID** (e.g., IA-001)
- **Description** (truncated)
- **Status badge** (draft/committed/superseded)
- **Quality score** (if set)
- **Category indicator**

### Node Colors

| Status | Color |
|--------|-------|
| Draft | Blue border |
| Committed | Green border |
| Superseded | Gray border |

### Quality Indicators

| Score | Indicator |
|-------|-----------|
| 80+ | Green badge |
| 60-79 | Yellow badge |
| Below 60 | Red badge |
| Not set | Gray badge |

## Organizing Atoms

### Drag and Drop

1. Click and hold an atom node
2. Drag to desired position
3. Release to drop

Positions are automatically saved when you drop an atom.

### Suggested Layouts

**By Status**:
- Draft atoms on the left
- Committed atoms in the center
- Superseded atoms on the right

**By Category**:
- Group related atoms together
- Use vertical separation for different categories

**By Feature**:
- Cluster atoms that belong to the same molecule
- Use spatial proximity to show relationships

## Creating Atoms on Canvas

1. Click the "+" button in the toolbar
2. Fill in the atom details in the dialog:
   - Description (required)
   - Category (required)
   - Tags (optional)
3. Click "Create"
4. The new atom appears at a default position

## Viewing Atom Details

Click an atom node to see:

- Full description
- Quality score breakdown
- Observable outcomes
- Falsifiability criteria
- Refinement history
- Tags

## Filtering and Search

Use the sidebar to filter atoms by:

- **Status**: draft, committed, superseded
- **Category**: functional, performance, security, etc.
- **Tags**: User-defined labels
- **Quality**: Above/below threshold

The canvas automatically highlights matching atoms.

## Real-time Updates

The canvas updates in real-time via WebSocket:

- New atoms appear automatically
- Status changes reflect immediately
- Position updates from other users sync

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `N` | New atom dialog |
| `Esc` | Close dialog/deselect |
| `Delete` | Delete selected (draft only) |
| `Enter` | Confirm dialog |

## Tips

1. **Use tags liberally** - They help with filtering
2. **Group by feature** - Makes molecules easier to visualize
3. **Review regularly** - Keep drafts moving to committed
4. **Clean up superseded** - Archive old atoms periodically

## Next Steps

- [Creating Atoms](./creating-atoms.md) - Writing quality atoms
- [Refinement Workflow](./refinement-workflow.md) - Improving atom quality
