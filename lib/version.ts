export const APP_VERSION = "1.1";

export interface ReleaseNote {
  version: string;
  title: string;
  date: string;
  summary: string;
  changes: string[];
}

export const RELEASE_NOTES: ReleaseNote[] = [
  {
    version: "1.1",
    title: "更通用的个人工作台",
    date: "2026-05-23",
    summary: "这一版把工作台从科研场景扩展为更通用的长期目标和日常执行工具。",
    changes: [
      "工作台标题支持自定义前缀，适合改成自己的学习、生活或项目工作台。",
      "新增随手记模块，用于记录灵感、复盘和临时想法。",
      "优化任务管理的视觉层级、紧凑度和拖拽排序反馈。",
      "AI 助手的操作建议独立展示，减少对话卡片的嵌套感。",
      "统一移除博士和科研限定表述，改为更通用的个人工作台定位。"
    ]
  },
  {
    version: "1.0",
    title: "基础工作台",
    date: "2026-05-22",
    summary: "初始稳定版，提供个人工作台的核心管理能力。",
    changes: [
      "支持任务和子任务管理，包含状态、优先级、截止日期和完成状态。",
      "支持每日习惯打卡和目标次数维护。",
      "提供心灵关怀模块，用于每日短句、能量自评和今日 focus。",
      "接入 AI 助手，支持拆解任务、整理计划和生成可确认的操作建议。",
      "提供多用户邀请注册、主题切换和基础自托管能力。"
    ]
  }
];
