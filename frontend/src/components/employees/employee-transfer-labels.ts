export function formatIsoDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return value;
  }

  const date = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
  );
  return date.toLocaleDateString();
}

export function personLabel(person: {
  username: string;
  employeeName: string | null;
  employeeCode: string | null;
}): string {
  if (person.employeeName) {
    return person.employeeCode
      ? `${person.employeeName} (${person.employeeCode})`
      : person.employeeName;
  }
  return person.username;
}

export function storeLabel(store: {
  storeCode: string;
  storeName: string;
}): string {
  return `${store.storeCode} — ${store.storeName}`;
}

export function branchLabel(branch: {
  branchCode: string;
  branchName: string;
}): string {
  return `${branch.branchCode} — ${branch.branchName}`;
}

export function localIsoDate(value = new Date()): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
