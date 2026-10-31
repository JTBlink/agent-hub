import { useApp } from "../context/AppContext";
import { TaskBrowser } from "../components/tasks/TaskBrowser";
export function Tasks() {
  const { projects } = useApp();
  return <TaskBrowser projects={projects} />;
}
