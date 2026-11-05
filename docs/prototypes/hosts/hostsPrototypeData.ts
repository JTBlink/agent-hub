// Synthetic prototype content only.
export type Profile = {
  id: string;
  name: string;
  note: string;
  content: string;
};
export type Backup = {
  id: string;
  label: string;
  time: string;
  content: string;
};
export const base = "# System hosts\n127.0.0.1 localhost\n::1 localhost\n";
export const initial: Profile[] = [
  {
    id: "dev",
    name: "本地开发",
    note: "本机服务与调试环境",
    content:
      base +
      "\n# Local services\n127.0.0.1 app.example.test\n127.0.0.1 api.example.test\n127.0.0.1 assets.example.test\n",
  },
  {
    id: "stage",
    name: "集成测试",
    note: "验证服务联调",
    content:
      base +
      "\n# Integration environment\n192.0.2.20 app.example.test\n192.0.2.21 api.example.test\n",
  },
  { id: "clean", name: "系统默认", note: "仅保留本机基础映射", content: base },
];
