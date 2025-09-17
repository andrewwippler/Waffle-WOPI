async function deleteFile(filename) {
  if (!confirm(`Delete ${decodeURIComponent(filename)}?`)) return;

  try {
    const res = await fetch(`/edit/${filename}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" }
    });

    if (res.ok) {
      location.reload();
    } else {
      const err = await res.json();
      alert(err.error || "Failed to delete file");
    }
  } catch (e) {
    alert("Error: " + e.message);
  }
}