const removeInvalidCashDepositOption = (root = document) => {
  root.querySelectorAll('select').forEach((select) => {
    const illegal = select.querySelector('option[value="4"]');
    const label = select.closest('label')?.textContent || '';
    if (illegal && /caução/i.test(label)) illegal.remove();
  });
};

export function installProductionGuards() {
  removeInvalidCashDepositOption();

  const observer = new MutationObserver((records) => {
    records.forEach((record) => record.addedNodes.forEach((node) => {
      if (node instanceof Element) removeInvalidCashDepositOption(node);
    }));
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });
  return () => observer.disconnect();
}
