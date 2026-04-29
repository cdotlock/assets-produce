"use client";

import { useState } from "react";
import { Button, Input, Modal, message } from "antd";
import { CloudUploadOutlined } from "@ant-design/icons";

const STORAGE_KEY = "sync-target-url";

export interface SyncButtonProps {
  type: "skill" | "mcp";
  name: string;
}

export function SyncButton({ type, name }: SyncButtonProps) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);

  const handleOpen = () => {
    const saved = localStorage.getItem(STORAGE_KEY) ?? "";
    setUrl(saved);
    setOpen(true);
  };

  const handleSync = async () => {
    const trimmed = url.trim();
    if (!trimmed) return;

    setLoading(true);
    try {
      localStorage.setItem(STORAGE_KEY, trimmed);
      const res = await fetch("/api/sync/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, name, targetUrl: trimmed }),
      });
      const data: Record<string, unknown> = await res.json() as Record<string, unknown>;
      if (!res.ok) {
        message.error(String(data.error ?? "同步失败"));
        return;
      }
      const action = data.action === "created" ? "已创建" : "已更新";
      message.success(`${action} → ${trimmed}`);
      setOpen(false);
    } catch (err) {
      message.error(err instanceof Error ? err.message : "网络错误");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button icon={<CloudUploadOutlined />} onClick={handleOpen}>
        同步到远程
      </Button>
      <Modal
        title="同步到远程实例"
        open={open}
        onCancel={() => setOpen(false)}
        onOk={handleSync}
        confirmLoading={loading}
        okText="推送"
        cancelText="取消"
      >
        <p style={{ marginBottom: 8, color: "#666" }}>
          将 {type === "skill" ? "Skill" : "MCP"} <strong>{name}</strong> 的当前版本推送到目标实例
        </p>
        <Input
          placeholder="https://example.com"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onPressEnter={handleSync}
        />
      </Modal>
    </>
  );
}
