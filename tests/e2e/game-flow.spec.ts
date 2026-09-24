import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';

async function createPlayer(browser: Browser, nickname: string): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('/');
  await page.getByPlaceholder('Tên của bạn').fill(nickname);
  await page.getByRole('button', { name: 'CREATE ROOM' }).click();
  await expect(page).toHaveURL(/\/room\/[A-Z0-9]{6}$/);
  return { context, page };
}

async function joinPlayer(browser: Browser, url: string, nickname: string): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(url);
  await expect(page.getByRole('heading', { name: 'ENTER YOUR NAME' })).toBeVisible();
  await page.getByPlaceholder('Nickname').fill(nickname);
  await page.getByRole('button', { name: 'JOIN ROOM' }).click();
  await expect(page.getByText(nickname, { exact: true })).toBeVisible();
  return { context, page };
}

async function setupGame(browser: Browser, playerCount: 2 | 3 | 4) {
  const host = await createPlayer(browser, `Host ${playerCount}`);
  if (playerCount !== 2) await host.page.getByRole('button', { name: `${playerCount} PLAYERS` }).click();
  const url = host.page.url();
  const participants = [host];
  for (let index = 1; index < playerCount; index++) participants.push(await joinPlayer(browser, url, `Guest ${playerCount}-${index}`));
  await expect(host.page.getByText(`${playerCount}/${playerCount}`, { exact: false })).toBeVisible();
  await host.page.getByRole('button', { name: 'START GAME' }).click();
  await Promise.all(participants.map(({ page }) => expect(page.locator('.game-shell')).toBeVisible()));
  return participants;
}

test('complete two-player lobby and synchronized first action', async ({ browser }) => {
  const participants = await setupGame(browser, 2);
  await participants[0].page.screenshot({ path: 'test-results/game-board-1440x900.png', fullPage: true });
  let actorPage: Page | undefined;
  for (const participant of participants) if (await participant.page.getByText('YOUR TURN', { exact: true }).isVisible()) actorPage = participant.page;
  expect(actorPage).toBeTruthy();
  const otherPage = participants.find(({ page }) => page !== actorPage)!.page;
  await actorPage!.locator('.bank .resource-token').nth(0).click();
  await actorPage!.locator('.bank .resource-token').nth(1).click();
  await actorPage!.locator('.bank .resource-token').nth(2).click();
  await actorPage!.getByRole('button', { name: 'TAKE', exact: true }).click();
  await expect(otherPage.getByText('YOUR TURN', { exact: true })).toBeVisible();
  await expect(actorPage!.getByText('YOUR TURN', { exact: true })).not.toBeVisible();
  await Promise.all(participants.map(({ context }) => context.close()));
});

test('desktop board has readable cards without horizontal overflow', async ({ browser }) => {
  const participants = await setupGame(browser, 2);
  const page = participants[0].page;
  for (const [width, height, minCard, minNoble] of [[1920, 1080, 299, 195], [1600, 900, 230, 170], [1440, 900, 205, 168], [1366, 768, 190, 155]]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(300);
    await page.locator('.market .game-card img').evaluateAll((images) => images.forEach((image) => { (image as HTMLImageElement).loading = 'eager'; }));
    await page.waitForFunction(() => [...document.querySelectorAll('.market .game-card img')].every((image) => (image as HTMLImageElement).complete));
    await page.waitForFunction(() => [...document.querySelectorAll('.bank .resource-token img')].every((image) => (image as HTMLImageElement).naturalWidth > 0));
    const dimensions = await page.evaluate(() => {
      const rect = (selector: string) => document.querySelector(selector)!.getBoundingClientRect();
      const card = rect('.market .game-card');
      const noble = rect('.noble-column .noble-card');
      const market = rect('.market');
      const bank = rect('.bank');
      const myBoard = rect('.my-board');
      const opponent = rect('.opponent');
      const takeButton = rect('.action-pair .primary');
      const lastCard = document.querySelector('.market .card-row .game-card:last-child')!.getBoundingClientRect();
      return { cardWidth: card.width, nobleWidth: noble.width, cardRight: lastCard.right, marketRight: market.right, bankLeft: bank.left, bankWidth: bank.width, opponentWidth: opponent.width, myBoardHeight: myBoard.height, myBoardBottom: myBoard.bottom, takeHeight: takeButton.height, scrollWidth: document.documentElement.scrollWidth };
    });
    console.log(`${width}x${height}: ${JSON.stringify(dimensions)}`);
    await page.screenshot({ path: `test-results/game-board-${width}x${height}.png`, fullPage: true });
    expect(dimensions.cardWidth).toBeGreaterThanOrEqual(minCard);
    expect(dimensions.nobleWidth).toBeGreaterThanOrEqual(minNoble);
    expect(dimensions.cardRight).toBeLessThan(dimensions.marketRight);
    expect(dimensions.marketRight).toBeLessThan(dimensions.bankLeft);
    expect(dimensions.bankLeft - dimensions.cardRight).toBeLessThanOrEqual(30);
    expect(dimensions.opponentWidth).toBeLessThanOrEqual(450);
    expect(dimensions.myBoardHeight).toBeGreaterThanOrEqual(90);
    expect(dimensions.myBoardHeight).toBeLessThanOrEqual(120);
    expect(dimensions.takeHeight).toBeGreaterThanOrEqual(44);
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(width);
  }
  await expect(page.locator('.my-board .my-collection').first().locator('.resource-token')).toHaveCount(6);
  await expect(page.locator('.my-board .reserved-slot')).toHaveCount(3);
  await page.locator('.market .game-card').first().click();
  await expect(page.locator('.card-dialog')).toBeVisible();
  await page.getByRole('button', { name: 'CLOSE' }).click();
  await Promise.all(participants.map(({ context }) => context.close()));
});

test('card detail keeps preview, costs, and actions in separate columns', async ({ browser }) => {
  const participants = await setupGame(browser, 2);
  const page = participants[0].page;
  await page.locator('.market .game-card').first().click();
  await expect(page.locator('.card-dialog')).toBeVisible();
  await page.waitForFunction(() => (document.querySelector('.card-dialog>.game-card img') as HTMLImageElement).naturalWidth > 0);

  for (const [width, height] of [[1920, 1080], [1440, 900], [1366, 768], [390, 844]]) {
    await page.setViewportSize({ width, height });
    const geometry = await page.evaluate(() => {
      const modal = document.querySelector('.card-dialog')!;
      const content = document.querySelector('.card-dialog-content')!;
      const rect = (selector: string) => document.querySelector(selector)!.getBoundingClientRect();
      const buttons = [...document.querySelectorAll('.card-dialog .dialog-actions button')].map((button) => button.getBoundingClientRect());
      return {
        modal: modal.getBoundingClientRect().toJSON(),
        preview: rect('.card-dialog>.game-card').toJSON(),
        content: content.getBoundingClientRect().toJSON(),
        heading: rect('.card-dialog-content h2').toJSON(),
        baseCost: rect('.card-dialog-content h3').toJSON(),
        afterDiscount: rect('.card-dialog-content .payment-list').toJSON(),
        actions: rect('.card-dialog .dialog-actions').toJSON(),
        buttons: buttons.map((button) => button.toJSON()),
        scrollWidth: modal.scrollWidth,
        clientWidth: modal.clientWidth,
        documentWidth: document.documentElement.scrollWidth,
      };
    });
    expect(geometry.modal.left).toBeGreaterThanOrEqual(0);
    expect(geometry.modal.right).toBeLessThanOrEqual(width);
    expect(geometry.preview.width).toBeLessThanOrEqual(width <= 700 ? 280 : 320);
    expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth);
    expect(geometry.documentWidth).toBeLessThanOrEqual(width);
    expect(geometry.baseCost.top).toBeGreaterThan(geometry.heading.bottom);
    expect(geometry.actions.top).toBeGreaterThan(geometry.afterDiscount.bottom);
    expect(geometry.buttons.every((button) => button.left >= geometry.content.left - 1 && button.right <= geometry.content.right + 1)).toBe(true);
    if (width > 700) {
      expect(geometry.preview.right).toBeLessThan(geometry.content.left);
      expect(geometry.actions.left).toBeGreaterThanOrEqual(geometry.content.left);
    } else {
      expect(geometry.preview.bottom).toBeLessThan(geometry.content.top);
    }
    await page.screenshot({ path: `test-results/card-detail-${width}x${height}.png` });
  }

  await page.getByRole('button', { name: 'CLOSE' }).click();
  await Promise.all(participants.map(({ context }) => context.close()));
});

for (const playerCount of [3, 4] as const) {
  test(`${playerCount}-player lobby starts and broadcasts gameplay`, async ({ browser }) => {
    const participants = await setupGame(browser, playerCount);
    let actorPage: Page | undefined;
    for (const participant of participants) if (await participant.page.getByText('YOUR TURN', { exact: true }).isVisible()) actorPage = participant.page;
    expect(actorPage).toBeTruthy();
    await actorPage!.locator('.bank .resource-token').nth(0).click();
    await actorPage!.locator('.bank .resource-token').nth(1).click();
    await actorPage!.locator('.bank .resource-token').nth(2).click();
    await actorPage!.getByRole('button', { name: 'TAKE', exact: true }).click();
    await expect(actorPage!.getByText('YOUR TURN', { exact: true })).not.toBeVisible();
    await Promise.all(participants.map(({ page }) => expect(page.locator('.game-shell')).toBeVisible()));
    await Promise.all(participants.map(({ context }) => context.close()));
  });
}
