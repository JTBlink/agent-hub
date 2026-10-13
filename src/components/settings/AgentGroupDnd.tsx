import {
  closestCenter,
  DndContext,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  rectSortingStrategy,
  SortableContext,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import * as api from "../../lib/tauri";

interface SortableAgentCardProps {
  agentKey: string;
  dragLabel: string;
  children: (dragHandle: React.ReactNode) => React.ReactNode;
}

function SortableAgentCard({
  agentKey,
  dragLabel,
  children,
}: SortableAgentCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: agentKey });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : undefined,
  };

  const handle = (
    <button
      type="button"
      ref={setActivatorNodeRef}
      {...listeners}
      onClick={(e) => e.stopPropagation()}
      className="mt-0.5 flex shrink-0 cursor-grab items-center justify-center rounded text-faint outline-none focus-visible:ring-2 focus-visible:ring-accent transition-colors hover:text-muted active:cursor-grabbing"
      title={dragLabel}
      aria-label={dragLabel}
    >
      <GripVertical className="h-3.5 w-3.5" />
    </button>
  );

  return (
    <div ref={setNodeRef} style={style} {...attributes} className="h-full">
      {children(handle)}
    </div>
  );
}

interface AgentGroupDndProps {
  items: api.ToolInfo[];
  sensors: ReturnType<typeof useSensors>;
  dragLabel: string;
  onDragEnd: (event: DragEndEvent, groupKeys: string[]) => void;
  renderAgentCard: (
    agent: api.ToolInfo,
    dragHandle?: React.ReactNode,
  ) => React.ReactNode;
}

export function AgentGroupDnd({
  items,
  sensors,
  dragLabel,
  onDragEnd,
  renderAgentCard,
}: AgentGroupDndProps) {
  const groupKeys = items.map((t) => t.key);
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={(e) => onDragEnd(e, groupKeys)}
    >
      <SortableContext items={groupKeys} strategy={rectSortingStrategy}>
        <div className="grid grid-cols-1 gap-1.5 md:grid-cols-2 xl:grid-cols-3">
          {items.map((agent) => (
            <SortableAgentCard
              key={agent.key}
              agentKey={agent.key}
              dragLabel={dragLabel}
            >
              {(handle) => renderAgentCard(agent, handle)}
            </SortableAgentCard>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
