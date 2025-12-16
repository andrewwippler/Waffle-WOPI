async function deleteFile(filename) {
  if (!confirm(`Delete ${decodeURIComponent(filename)}?`)) return;

  try {
    const res = await fetch(`/edit?file=${filename}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" }
    });

    if (res.ok) {
      location.reload();
      return;
    }

    // If server asks for confirmation for non-empty directory
    if (res.status === 409) {
      const body = await res.json().catch(() => ({}));
      if (body && body.needsConfirmation) {
        const msg = `Folder is not empty (${body.entries} items). Delete recursively?`;
        if (!confirm(msg)) return;
        // send confirmed delete
        const res2 = await fetch(`/edit?file=${filename}&confirm=1`, { method: "DELETE" });
        if (res2.ok) return location.reload();
        const err2 = await res2.json().catch(() => ({}));
        return alert(err2.error || "Failed to delete");
      }
    }

    const err = await res.json().catch(() => ({}));
    alert(err.error || "Failed to delete");
  } catch (e) {
    alert("Error: " + e.message);
  }
}