import React, { useState } from "react";
import { Plus } from "lucide-react";

const STAGES = ["Assembly", "PDI", "Dispatch"];
const STATUS = ["Yet to Start", "In Progress", "Completed"];

export default function CreateNonMotorProcess() {
  /* ---------------- STATE ---------------- */
  const [components, setComponents] = useState([]);
  const [componentName, setComponentName] = useState("");

  const [stageStatus, setStageStatus] = useState({
    Assembly: "Yet to Start",
    PDI: "Yet to Start",
    Dispatch: "Yet to Start",
  });

  const [editingRow, setEditingRow] = useState(null);
  const [editValue, setEditValue] = useState("");

  /* ---------------- LOGIC ---------------- */

  const addComponent = () => {
    if (!componentName.trim()) return;

    setComponents((prev) => [
      ...prev,
      { id: Date.now(), name: componentName },
    ]);
    setComponentName("");
  };

  const startEdit = (row) => {
    setEditingRow(row.id);
    setEditValue(row.name);
  };

  const saveEdit = (id) => {
    setComponents((prev) =>
      prev.map((c) => (c.id === id ? { ...c, name: editValue } : c))
    );
    setEditingRow(null);
  };

  const cancelEdit = () => {
    setEditingRow(null);
    setEditValue("");
  };

  const updateStage = (stage, value) => {
    if (stage === "PDI" && stageStatus.Assembly !== "Completed") {
      alert("Complete Assembly first");
      return;
    }
    if (stage === "Dispatch" && stageStatus.PDI !== "Completed") {
      alert("Complete PDI first");
      return;
    }

    setStageStatus((prev) => ({ ...prev, [stage]: value }));
  };

  const statusBadge = (status) => {
    if (status === "Completed") return "bg-green-100 text-green-800";
    if (status === "In Progress") return "bg-blue-100 text-blue-800";
    return "bg-gray-200 text-gray-700";
  };

  /* ---------------- UI ---------------- */

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      {/* HEADER */}
      <div className="bg-yellow-400 px-6 py-4 rounded-t-lg">
        <h1 className="text-lg font-semibold">
          Create Non-Motor Manufacturing Process
        </h1>
      </div>

      {/* BODY */}
      <div className="bg-white rounded-b-lg shadow p-6 space-y-6">
        {/* ADD COMPONENT */}
        <div className="flex items-center gap-4">
          <input
            className="border px-4 py-2 rounded w-80 text-base"
            placeholder="Enter Component Name"
            value={componentName}
            onChange={(e) => setComponentName(e.target.value)}
          />
          <button
            onClick={addComponent}
            className="flex items-center gap-2 bg-yellow-500 px-5 py-2 rounded font-medium"
          >
            <Plus size={18} />
            Add Component
          </button>
        </div>

        {/* TABLE */}
        <div className="overflow-x-auto">
          <table className="w-full border text-base">
            <thead className="bg-yellow-100">
              <tr>
                <th className="border px-4 py-3 text-left">Component</th>
                {STAGES.map((s) => (
                  <th key={s} className="border px-4 py-3 text-center">
                    {s}
                  </th>
                ))}
                <th className="border px-4 py-3 text-center">Action</th>
              </tr>
            </thead>

            <tbody>
              {components.length === 0 && (
                <tr>
                  <td
                    colSpan={STAGES.length + 2}
                    className="text-center py-6 text-gray-500"
                  >
                    No components added
                  </td>
                </tr>
              )}

              {components.map((row) => (
                <tr key={row.id} className="hover:bg-gray-50">
                  {/* COMPONENT NAME */}
                  <td className="border px-4 py-3">
                    {editingRow === row.id ? (
                      <input
                        className="border px-3 py-2 w-full text-base rounded"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                      />
                    ) : (
                      row.name
                    )}
                  </td>

                  {/* STAGES */}
                  {STAGES.map((stage) => (
                    <td
                      key={stage}
                      className="border px-4 py-3 text-center"
                    >
                      <div
                        className={`inline-block px-4 py-1 rounded-full font-medium ${statusBadge(
                          stageStatus[stage]
                        )}`}
                      >
                        {stageStatus[stage]}
                      </div>

                      <div className="flex justify-center gap-3 mt-3">
                        <button
                          className="px-3 py-1 border rounded"
                          onClick={() => updateStage(stage, "In Progress")}
                        >
                          Start
                        </button>
                        <button
                          className="px-3 py-1 border rounded"
                          onClick={() => updateStage(stage, "Completed")}
                        >
                          Complete
                        </button>
                      </div>
                    </td>
                  ))}

                  {/* ACTIONS */}
                  <td className="border px-4 py-3 text-center">
                    {editingRow === row.id ? (
                      <div className="flex justify-center gap-3">
                        <button
                          onClick={() => saveEdit(row.id)}
                          className="bg-green-500 text-white px-4 py-1 rounded"
                        >
                          Save
                        </button>
                        <button
                          onClick={cancelEdit}
                          className="bg-gray-300 px-4 py-1 rounded"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => startEdit(row)}
                        className="bg-blue-500 text-white px-4 py-1 rounded"
                      >
                        Edit
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
