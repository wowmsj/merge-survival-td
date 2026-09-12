-- 游客模式 + 账号系统（Supabase）云存档表
-- 在 Supabase SQL Editor 里整段执行一次即可
create table if not exists public.saves (
  user_id    uuid primary key references auth.users on delete cascade,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.saves enable row level security;

-- 每个用户只能读写自己的存档（anon key 配合 RLS 放客户端是安全的）
create policy "own read"   on public.saves for select using (auth.uid() = user_id);
create policy "own write"  on public.saves for insert with check (auth.uid() = user_id);
create policy "own update" on public.saves for update using (auth.uid() = user_id);
