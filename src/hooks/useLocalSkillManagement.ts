import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import * as api from "../lib/tauri";
import { getErrorMessage } from "../lib/error";
import type { LocalSkillSelection } from "../lib/localSkillScan";

export function useLocalSkillManagement(
  runScan: () => Promise<void>,
  onChanged: () => Promise<void>,
) {
  const { t } = useTranslation();
  const [detail, setDetail] = useState<LocalSkillSelection | null>(null);
  const [content, setContent] = useState<string | null>(null);
  const [documentError, setDocumentError] = useState<string | null>(null);
  const [documentLoading, setDocumentLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<LocalSkillSelection | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const requestId = useRef(0);
  useEffect(
    () => () => {
      requestId.current += 1;
    },
    [],
  );
  const viewLocation = async (selection: LocalSkillSelection) => {
    const id = ++requestId.current;
    setDetail(selection);
    setContent(null);
    setDocumentError(null);
    setDocumentLoading(true);
    try {
      const doc = await api.getDiscoveredSkillDocument(selection.location.id);
      if (id === requestId.current) setContent(doc);
    } catch (error: unknown) {
      if (id === requestId.current)
        setDocumentError(getErrorMessage(error, t("common.error")));
    } finally {
      if (id === requestId.current) setDocumentLoading(false);
    }
  };
  const removeLocation = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      await api.deleteDiscoveredSkill(deleteTarget.location.id);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, t("common.error")));
      setBusy(false);
      return;
    }
    toast.success(
      t("globalWorkspace.localSkills.deletedLocalToast", {
        name: deleteTarget.name,
        agent: deleteTarget.location.tool,
      }),
    );
    const results = await Promise.allSettled([runScan(), onChanged()]);
    if (results.some((result) => result.status === "rejected"))
      toast.error(t("install.scan.refreshFailed"));
    setBusy(false);
  };
  const closeDetail = () => {
    requestId.current += 1;
    setDetail(null);
  };
  const closeDelete = () => {
    if (!busy) setDeleteTarget(null);
  };
  return {
    detail,
    content,
    documentError,
    documentLoading,
    deleteTarget,
    busy,
    viewLocation,
    setDeleteTarget,
    removeLocation,
    closeDetail,
    closeDelete,
  };
}
