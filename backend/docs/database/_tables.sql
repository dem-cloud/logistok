create table public.billing_details (
  id uuid not null default gen_random_uuid (),
  company_id uuid not null,
  is_corporate boolean not null default true,
  billing_name text not null,
  tax_id text null,
  tax_office text null,
  address text null,
  city text null,
  postal_code text null,
  country text null,
  is_active boolean not null default true,
  created_at timestamp with time zone not null default now(),
  constraint billing_details_pkey primary key (id),
  constraint billing_details_company_id_fkey foreign KEY (company_id) references companies (id)
) TABLESPACE pg_default;

create table public.companies (
  name text not null default 'Χωρίς Όνομα'::text,
  id uuid not null default gen_random_uuid (),
  display_name text null,
  tax_id text null,
  tax_office text null,
  address text null,
  city text null,
  postal_code text null,
  country text null,
  phone text null,
  email text null,
  logo_url text null,
  settings jsonb null,
  created_at timestamp with time zone not null default now(),
  stripe_customer_id text null,
  allow_negative_stock boolean not null default false,
  constraint companies_pkey primary key (id),
  constraint companies_stripe_customer_id_key unique (stripe_customer_id)
) TABLESPACE pg_default;

create table public.company_industries (
  company_id uuid not null,
  industry_key text not null,
  created_at timestamp with time zone not null default now(),
  constraint company_industries_pkey primary key (company_id, industry_key),
  constraint company_industries_company_id_fkey foreign KEY (company_id) references companies (id),
  constraint company_industries_industry_key_fkey foreign KEY (industry_key) references industries (key)
) TABLESPACE pg_default;

create table public.company_plugins (
  created_at timestamp with time zone not null default now(),
  settings jsonb null,
  activated_at timestamp with time zone not null default now(),
  deactivated_at timestamp with time zone null,
  id uuid not null default gen_random_uuid (),
  company_id uuid not null,
  subscription_item_id uuid null,
  plugin_key text not null,
  status text not null default 'active'::text,
  updated_at timestamp with time zone not null default now(),
  disabled_reason text null,
  constraint company_plugins_pkey primary key (id),
  constraint company_plugins_company_id_fkey foreign KEY (company_id) references companies (id),
  constraint company_plugins_plugin_key_fkey foreign KEY (plugin_key) references plugins (key),
  constraint company_plugins_subscription_item_id_fkey foreign KEY (subscription_item_id) references subscription_items (id)
) TABLESPACE pg_default;

create index IF not exists company_plugins_company_idx on public.company_plugins using btree (company_id) TABLESPACE pg_default;

create table public.company_users (
  id uuid not null default gen_random_uuid (),
  created_at timestamp with time zone not null default now(),
  company_id uuid not null,
  user_id uuid not null,
  role_id uuid null,
  is_owner boolean not null default false,
  status text not null default 'active'::text,
  disabled_reason text null,
  constraint company_users_pkey primary key (id),
  constraint company_users_company_id_fkey foreign KEY (company_id) references companies (id),
  constraint company_users_role_id_fkey foreign KEY (role_id) references roles (id),
  constraint company_users_user_id_fkey foreign KEY (user_id) references users (id)
) TABLESPACE pg_default;

create unique INDEX IF not exists company_users_unique on public.company_users using btree (company_id, user_id) TABLESPACE pg_default;

create index IF not exists company_users_role_idx on public.company_users using btree (role_id) TABLESPACE pg_default;

create table public.customers (
  id uuid not null default gen_random_uuid (),
  created_at timestamp with time zone not null default now(),
  full_name text not null,
  phone text null,
  email text null,
  tax_id text null,
  address text null,
  city text null,
  postal_code text null,
  country text null,
  notes text null,
  company_id uuid not null,
  created_by uuid null,
  payment_terms text not null default 'immediate'::text,
  constraint customers_pkey primary key (id),
  constraint customers_company_id_fkey foreign KEY (company_id) references companies (id),
  constraint customers_created_by_fkey foreign KEY (created_by) references users (id),
  constraint customers_payment_terms_check check (
    (
      payment_terms = any (
        array[
          'immediate'::text,
          '15'::text,
          '30'::text,
          '60'::text,
          '90'::text
        ]
      )
    )
  )
) TABLESPACE pg_default;

create index IF not exists customers_company_idx on public.customers using btree (company_id) TABLESPACE pg_default;

create index IF not exists customers_taxid_idx on public.customers using btree (tax_id) TABLESPACE pg_default;

create table public.default_role_permissions (
  permission_key text not null,
  default_role_key text not null,
  created_at timestamp with time zone not null default now(),
  constraint default_role_permissions_pkey primary key (permission_key, default_role_key),
  constraint default_role_permissions_default_role_key_fkey foreign KEY (default_role_key) references default_roles (key),
  constraint default_role_permissions_permission_key_fkey foreign KEY (permission_key) references permissions (key)
) TABLESPACE pg_default;

create unique INDEX IF not exists default_role_permissions_unique on public.default_role_permissions using btree (default_role_key, permission_key) TABLESPACE pg_default;

create table public.default_roles (
  name text not null,
  description text null,
  key text not null,
  created_at timestamp with time zone not null default now(),
  industry_key text null,
  constraint default_roles_pkey primary key (key),
  constraint default_roles_key_key unique (key),
  constraint default_roles_industry_key_fkey foreign KEY (industry_key) references industries (key)
) TABLESPACE pg_default;

create table public.document_sequences (
  company_id uuid not null,
  document_type text not null,
  year integer not null,
  last_sequence integer not null default 0,
  constraint document_sequences_pkey primary key (company_id, document_type, year),
  constraint document_sequences_company_id_fkey foreign KEY (company_id) references companies (id) on delete CASCADE
) TABLESPACE pg_default;

create table public.industries (
  created_at timestamp with time zone not null default now(),
  key text not null,
  description text not null,
  photo_url text not null,
  is_active boolean not null default true,
  priority integer not null default 100,
  name text not null,
  constraint industries_pkey primary key (key),
  constraint industries_name_key unique (key)
) TABLESPACE pg_default;

create table public.invitations (
  id uuid not null default gen_random_uuid (),
  invited_email text not null,
  company_id uuid not null,
  role_id uuid not null,
  invited_by uuid not null,
  token uuid not null default gen_random_uuid (),
  status text not null default 'pending'::text,
  created_at timestamp with time zone not null,
  accepted_at timestamp with time zone null,
  expires_at timestamp with time zone not null,
  constraint invitations_pkey primary key (id)
) TABLESPACE pg_default;

create table public.onboarding (
  created_at timestamp with time zone not null default now(),
  current_step integer not null default 1,
  is_completed boolean not null default false,
  id uuid not null default gen_random_uuid (),
  company_id uuid not null,
  data jsonb not null default '{"plan": null, "company": {"name": "", "phone": ""}, "plugins": [], "branches": 0, "industries": []}'::jsonb,
  updated_at timestamp with time zone not null default now(),
  max_step_reached integer not null default 1,
  meta jsonb not null default '{}'::jsonb,
  constraint onboarding_pkey primary key (id),
  constraint onboarding_company_id_fkey foreign KEY (company_id) references companies (id)
) TABLESPACE pg_default;

create table public.payment_history (
  id uuid not null default gen_random_uuid (),
  subscription_id uuid not null,
  stripe_payment_intent_id text null,
  stripe_invoice_id text not null,
  stripe_charge_id text null,
  amount numeric not null,
  currency text not null default 'eur'::text,
  status text not null,
  payment_method text null,
  failure_reason text null,
  metadata jsonb null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  paid_at timestamp with time zone null,
  billing_details_id uuid not null,
  constraint payment_history_pkey primary key (id),
  constraint payment_history_stripe_invoice_id_key unique (stripe_invoice_id),
  constraint payment_history_billing_details_id_fkey foreign KEY (billing_details_id) references billing_details (id),
  constraint payment_history_subscription_id_fkey foreign KEY (subscription_id) references subscriptions (id)
) TABLESPACE pg_default;

create table public.payment_methods (
  id uuid not null default gen_random_uuid (),
  created_at timestamp with time zone not null default now(),
  key text not null,
  name text not null,
  added_by_plugin_key text null,
  added_by_user uuid null,
  priority integer not null default 100,
  is_active boolean not null default true,
  company_id uuid null,
  type text not null default 'system'::text,
  metadata jsonb null,
  constraint payment_methods_pkey primary key (id),
  constraint payment_methods_added_by_plugin_key_fkey foreign KEY (added_by_plugin_key) references plugins (key),
  constraint payment_methods_added_by_user_fkey foreign KEY (added_by_user) references users (id),
  constraint payment_methods_company_id_fkey foreign KEY (company_id) references companies (id)
) TABLESPACE pg_default;

create table public.payments (
  id bigint generated by default as identity not null,
  created_at timestamp with time zone not null default now(),
  company_id uuid not null,
  store_id uuid not null,
  purchase_id bigint null,
  vendor_id uuid null,
  amount numeric not null,
  payment_method_id uuid not null,
  payment_date timestamp with time zone not null default now(),
  notes text null,
  created_by uuid null,
  is_auto boolean not null default false,
  constraint payments_pkey primary key (id),
  constraint payments_created_by_fkey foreign KEY (created_by) references users (id),
  constraint payments_payment_method_id_fkey foreign KEY (payment_method_id) references payment_methods (id),
  constraint payments_company_id_fkey foreign KEY (company_id) references companies (id),
  constraint payments_purchase_id_fkey foreign KEY (purchase_id) references purchases (id),
  constraint payments_store_id_fkey foreign KEY (store_id) references stores (id),
  constraint payments_vendor_id_fkey foreign KEY (vendor_id) references vendors (id)
) TABLESPACE pg_default;

create index IF not exists payments_company_id_idx on public.payments using btree (company_id) TABLESPACE pg_default;

create index IF not exists payments_store_id_idx on public.payments using btree (store_id) TABLESPACE pg_default;

create index IF not exists payments_purchase_id_idx on public.payments using btree (purchase_id) TABLESPACE pg_default;

create table public.permissions (
  key text not null,
  name text not null,
  description text null,
  created_at timestamp with time zone not null default now(),
  plugin_key text null,
  constraint permissions_pkey primary key (key),
  constraint permissions_name_key unique (key),
  constraint permissions_plugin_key_fkey foreign KEY (plugin_key) references plugins (key)
) TABLESPACE pg_default;

create table public.plans (
  created_at timestamp with time zone not null default now(),
  name text not null,
  max_users integer null,
  features jsonb null default '[]'::jsonb,
  is_public boolean not null default false,
  description text null,
  stripe_price_id_monthly text null,
  stripe_price_id_yearly text null,
  priority integer not null default 100,
  key text not null,
  id uuid not null default gen_random_uuid (),
  is_free boolean not null default false,
  allows_paid_plugins boolean not null default true,
  rank integer not null default 1,
  is_popular boolean not null default false,
  cached_price_monthly numeric null,
  cached_price_yearly numeric null,
  updated_at timestamp with time zone not null default now(),
  included_branches integer not null default 0,
  cached_extra_store_price_monthly numeric null,
  cached_extra_store_price_yearly numeric null,
  stripe_extra_store_price_id_monthly text null,
  stripe_extra_store_price_id_yearly text null,
  cached_updated_at timestamp with time zone null,
  cached_currency text not null default 'EUR'::text,
  max_products integer null,
  constraint plans_pkey primary key (id),
  constraint plans_key_key unique (key)
) TABLESPACE pg_default;

create table public.plugin_industries (
  plugin_key text not null,
  relevance_score integer not null default 5,
  created_at timestamp with time zone not null default now(),
  industry_key text not null,
  constraint plugin_industries_pkey primary key (plugin_key, industry_key),
  constraint plugin_industries_industry_key_fkey foreign KEY (industry_key) references industries (key),
  constraint plugin_industries_plugin_key_fkey foreign KEY (plugin_key) references plugins (key)
) TABLESPACE pg_default;

create table public.plugin_industry_recommendations (
  plugin_key text not null,
  priority integer not null default 100,
  created_at timestamp with time zone not null default now(),
  industry_key text null,
  scope text not null default 'onboarding'::text,
  id uuid not null default gen_random_uuid (),
  constraint plugin_industry_recommendations_pkey primary key (id),
  constraint plugin_industry_recommendations_industry_key_fkey foreign KEY (industry_key) references industries (key),
  constraint plugin_industry_recommendations_plugin_key_fkey foreign KEY (plugin_key) references plugins (key)
) TABLESPACE pg_default;

create unique INDEX IF not exists uniq_plugin_industry_scope on public.plugin_industry_recommendations using btree (plugin_key, industry_key, scope) TABLESPACE pg_default
where
  (industry_key is not null);

create unique INDEX IF not exists uniq_plugin_global_scope on public.plugin_industry_recommendations using btree (plugin_key, scope) TABLESPACE pg_default
where
  (industry_key is null);

  create table public.plugins (
  key text not null,
  created_at timestamp with time zone not null default now(),
  name text not null,
  description text null,
  stripe_price_id_monthly text null,
  stripe_price_id_yearly text null,
  default_settings jsonb null,
  is_active boolean not null default false,
  photo_url text null,
  current_version text null,
  id uuid not null default gen_random_uuid (),
  cached_price_monthly numeric null,
  cached_price_yearly numeric null,
  updated_at timestamp with time zone not null default now(),
  cached_currency text not null default 'EUR'::text,
  cached_updated_at timestamp with time zone null,
  constraint plugins_pkey primary key (id),
  constraint plugins_key_key unique (key)
) TABLESPACE pg_default;

create table public.product_categories (
  id bigint generated by default as identity not null,
  created_at timestamp with time zone not null default now(),
  name text not null,
  company_id uuid not null,
  parent_id bigint null,
  constraint product_categories_pkey primary key (id),
  constraint product_categories_company_id_fkey foreign KEY (company_id) references companies (id)
) TABLESPACE pg_default;

create table public.product_variants (
  id bigint generated by default as identity not null,
  created_at timestamp with time zone not null default now(),
  product_id bigint not null,
  name text not null,
  sku text null,
  barcode text null,
  cost_price numeric null,
  constraint product_variants_pkey primary key (id),
  constraint product_variants_sku_key unique (sku),
  constraint product_variants_product_id_fkey foreign KEY (product_id) references products (id)
) TABLESPACE pg_default;

create unique INDEX IF not exists product_variants_barcode_unique on public.product_variants using btree (barcode) TABLESPACE pg_default
where
  (
    (barcode is not null)
    and (barcode <> ''::text)
  );

  create table public.products (
  id bigint generated by default as identity not null,
  created_at timestamp with time zone not null default now(),
  name text not null,
  unit_id bigint null,
  product_category_id bigint null,
  description text null,
  company_id uuid not null,
  vat_rate_id bigint null,
  vat_exempt boolean not null default false,
  constraint products_pkey primary key (id),
  constraint products_company_id_fkey foreign KEY (company_id) references companies (id),
  constraint products_product_category_id_fkey foreign KEY (product_category_id) references product_categories (id),
  constraint products_unit_id_fkey foreign KEY (unit_id) references units (id),
  constraint products_vat_rate_id_fkey foreign KEY (vat_rate_id) references vat_rates (id)
) TABLESPACE pg_default;

create table public.purchase_items (
  id bigint generated by default as identity not null,
  created_at timestamp with time zone not null default now(),
  purchase_id bigint not null,
  product_id bigint not null,
  product_variant_id bigint not null,
  quantity numeric not null,
  cost_price numeric not null,
  total_cost numeric not null,
  vat_rate numeric not null default 0,
  vat_exempt boolean not null default false,
  constraint purchase_items_pkey primary key (id),
  constraint purchase_items_product_id_fkey foreign KEY (product_id) references products (id),
  constraint purchase_items_product_variant_id_fkey foreign KEY (product_variant_id) references product_variants (id),
  constraint purchase_items_purchase_id_fkey foreign KEY (purchase_id) references purchases (id)
) TABLESPACE pg_default;

create table public.purchases (
  created_at timestamp with time zone not null default now(),
  company_id uuid not null,
  store_id uuid not null,
  vendor_id uuid null,
  created_by uuid null,
  invoice_number text null,
  invoice_date timestamp with time zone null,
  total_amount numeric not null,
  status text not null default 'received'::text,
  id bigint generated by default as identity not null,
  notes text null,
  subtotal numeric null,
  vat_total numeric null,
  payment_method_id uuid not null,
  document_type text not null default 'PUR'::text,
  converted_from_id bigint null,
  payment_terms text not null default 'immediate'::text,
  due_date timestamp with time zone null,
  payment_status text null default 'unpaid'::text,
  amount_due numeric null,
  constraint purchases_pkey primary key (id),
  constraint purchases_converted_from_id_fkey foreign KEY (converted_from_id) references purchases (id),
  constraint purchases_created_by_fkey foreign KEY (created_by) references users (id),
  constraint purchases_payment_method_id_fkey foreign KEY (payment_method_id) references payment_methods (id),
  constraint purchases_company_id_fkey foreign KEY (company_id) references companies (id),
  constraint purchases_store_id_fkey foreign KEY (store_id) references stores (id),
  constraint purchases_vendor_id_fkey foreign KEY (vendor_id) references vendors (id),
  constraint purchases_document_type_check check (
    (
      document_type = any (array['PUR'::text, 'GRN'::text, 'DBN'::text, 'PO'::text])
    )
  ),
  constraint purchases_status_check check (
    (
      status = any (
        array[
          'draft'::text,
          'ordered'::text,
          'received'::text,
          'completed'::text,
          'cancelled'::text,
          'invoiced'::text
        ]
      )
    )
  ),
  constraint purchases_payment_status_check check (
    (
      (payment_status is null)
      or (
        payment_status = any (
          array[
            'unpaid'::text,
            'partial'::text,
            'paid'::text,
            'overdue'::text
          ]
        )
      )
    )
  ),
  constraint purchases_payment_terms_check check (
    (
      payment_terms = any (
        array[
          'immediate'::text,
          '15'::text,
          '30'::text,
          '60'::text,
          '90'::text
        ]
      )
    )
  )
) TABLESPACE pg_default;

create table public.receipts (
  id bigint generated by default as identity not null,
  created_at timestamp with time zone not null default now(),
  company_id uuid not null,
  store_id uuid not null,
  sale_id bigint null,
  customer_id uuid null,
  amount numeric not null,
  payment_method_id uuid not null,
  payment_date timestamp with time zone not null default now(),
  notes text null,
  created_by uuid null,
  is_auto boolean not null default false,
  constraint receipts_pkey primary key (id),
  constraint receipts_created_by_fkey foreign KEY (created_by) references users (id),
  constraint receipts_customer_id_fkey foreign KEY (customer_id) references customers (id),
  constraint receipts_company_id_fkey foreign KEY (company_id) references companies (id),
  constraint receipts_sale_id_fkey foreign KEY (sale_id) references sales (id),
  constraint receipts_store_id_fkey foreign KEY (store_id) references stores (id),
  constraint receipts_payment_method_id_fkey foreign KEY (payment_method_id) references payment_methods (id)
) TABLESPACE pg_default;

create index IF not exists receipts_company_id_idx on public.receipts using btree (company_id) TABLESPACE pg_default;

create index IF not exists receipts_store_id_idx on public.receipts using btree (store_id) TABLESPACE pg_default;

create index IF not exists receipts_sale_id_idx on public.receipts using btree (sale_id) TABLESPACE pg_default;

create table public.role_permissions (
  role_id uuid not null,
  source text not null default 'default_role'::text,
  created_at timestamp with time zone not null default now(),
  permission_key text not null,
  constraint role_permissions_pkey primary key (role_id, permission_key),
  constraint role_permissions_permission_key_fkey foreign KEY (permission_key) references permissions (key),
  constraint role_permissions_role_id_fkey foreign KEY (role_id) references roles (id)
) TABLESPACE pg_default;

create table public.role_store_restrictions (
  id uuid not null default gen_random_uuid (),
  role_id uuid not null,
  store_id uuid not null,
  created_at timestamp with time zone not null default now(),
  constraint role_store_restrictions_pkey primary key (id),
  constraint role_store_restrictions_role_id_fkey foreign KEY (role_id) references roles (id),
  constraint role_store_restrictions_store_id_fkey foreign KEY (store_id) references stores (id)
) TABLESPACE pg_default;

create table public.roles (
  created_at timestamp with time zone not null default now(),
  name text not null,
  id uuid not null default gen_random_uuid (),
  company_id uuid not null,
  description text null,
  key text not null,
  constraint roles_pkey primary key (id),
  constraint roles_company_id_fkey foreign KEY (company_id) references companies (id)
) TABLESPACE pg_default;

create table public.sale_items (
  created_at timestamp with time zone not null default now(),
  product_id bigint not null,
  product_variant_id bigint not null,
  quantity numeric not null,
  sale_price numeric not null,
  total_price numeric not null,
  id bigint generated by default as identity not null,
  sale_id bigint not null,
  vat_rate numeric not null default 0,
  vat_exempt boolean not null default false,
  constraint sale_items_pkey primary key (id),
  constraint sale_items_product_id_fkey foreign KEY (product_id) references products (id),
  constraint sale_items_product_variant_id_fkey foreign KEY (product_variant_id) references product_variants (id),
  constraint sale_items_sale_id_fkey foreign KEY (sale_id) references sales (id)
) TABLESPACE pg_default;

create table public.sales (
  created_at timestamp with time zone not null default now(),
  company_id uuid not null,
  store_id uuid not null,
  customer_id uuid null,
  created_by uuid null,
  source text not null default 'manual'::text,
  total_amount numeric not null,
  payment_method_id uuid not null,
  status text not null default 'completed'::text,
  id bigint generated by default as identity not null,
  invoice_number text null,
  invoice_type text not null default 'REC'::text,
  notes text null,
  subtotal numeric null,
  vat_total numeric null,
  amount_paid numeric null,
  change_returned numeric null,
  converted_from_id bigint null,
  expiry_date timestamp with time zone null,
  invoice_date timestamp with time zone null,
  payment_terms text not null default 'immediate'::text,
  due_date timestamp with time zone null,
  payment_status text null default 'unpaid'::text,
  amount_due numeric null,
  constraint sales_pkey primary key (id),
  constraint sales_converted_from_id_fkey foreign KEY (converted_from_id) references sales (id),
  constraint sales_created_by_fkey foreign KEY (created_by) references users (id),
  constraint sales_customer_id_fkey foreign KEY (customer_id) references customers (id),
  constraint sales_payment_method_id_fkey foreign KEY (payment_method_id) references payment_methods (id),
  constraint sales_store_id_fkey foreign KEY (store_id) references stores (id),
  constraint sales_company_id_fkey foreign KEY (company_id) references companies (id),
  constraint sales_payment_terms_check check (
    (
      payment_terms = any (
        array[
          'immediate'::text,
          '15'::text,
          '30'::text,
          '60'::text,
          '90'::text
        ]
      )
    )
  ),
  constraint sales_invoice_type_check check (
    (
      invoice_type = any (
        array[
          'QUO'::text,
          'REC'::text,
          'INV'::text,
          'CRN'::text,
          'DNO'::text
        ]
      )
    )
  ),
  constraint sales_payment_status_check check (
    (
      (payment_status is null)
      or (
        payment_status = any (
          array[
            'unpaid'::text,
            'partial'::text,
            'paid'::text,
            'overdue'::text
          ]
        )
      )
    )
  )
) TABLESPACE pg_default;

create table public.stock_movements (
  id bigint generated by default as identity not null,
  created_at timestamp with time zone not null default now(),
  product_id bigint not null,
  product_variant_id bigint not null,
  quantity numeric not null,
  movement_type text not null,
  created_by uuid null,
  company_id uuid not null,
  source text not null default 'manual'::text,
  store_id uuid not null,
  related_document_type text null,
  related_document_id bigint null,
  constraint stock_movements_pkey primary key (id),
  constraint stock_movements_created_by_fkey foreign KEY (created_by) references users (id),
  constraint stock_movements_company_id_fkey foreign KEY (company_id) references companies (id),
  constraint stock_movements_product_variant_id_fkey foreign KEY (product_variant_id) references product_variants (id),
  constraint stock_movements_product_id_fkey foreign KEY (product_id) references products (id),
  constraint stock_movements_store_id_fkey foreign KEY (store_id) references stores (id),
  constraint stock_movements_related_document_type_check check (
    (
      (related_document_type is null)
      or (
        related_document_type = any (
          array[
            'sale'::text,
            'purchase'::text,
            'adjustment'::text,
            'transfer'::text,
            'sale_reversal'::text,
            'credit_note'::text,
            'debit_note'::text
          ]
        )
      )
    )
  )
) TABLESPACE pg_default;

create table public.store_plugins (
  created_at timestamp with time zone not null default now(),
  settings jsonb null,
  id uuid not null default gen_random_uuid (),
  company_plugin_id uuid not null,
  store_id uuid not null,
  is_active boolean not null default true,
  constraint store_plugins_pkey primary key (id),
  constraint store_plugins_company_plugin_id_fkey foreign KEY (company_plugin_id) references company_plugins (id),
  constraint store_plugins_store_id_fkey foreign KEY (store_id) references stores (id)
) TABLESPACE pg_default;

create table public.store_products (
  id bigint generated by default as identity not null,
  created_at timestamp with time zone not null default now(),
  product_id bigint not null,
  product_variant_id bigint not null,
  stock_quantity numeric not null default '0'::numeric,
  store_sale_price numeric null,
  store_id uuid not null,
  constraint store_products_pkey primary key (id),
  constraint store_products_product_id_fkey foreign KEY (product_id) references products (id),
  constraint store_products_product_variant_id_fkey foreign KEY (product_variant_id) references product_variants (id),
  constraint store_products_store_id_fkey foreign KEY (store_id) references stores (id)
) TABLESPACE pg_default;

create unique INDEX IF not exists store_products_unique_store_variant on public.store_products using btree (store_id, product_variant_id) TABLESPACE pg_default;

create table public.stores (
  created_at timestamp with time zone not null default now(),
  name text not null default 'Κεντρική Αποθήκη'::text,
  address text null,
  city text null,
  country text null,
  id uuid not null default gen_random_uuid (),
  company_id uuid not null,
  postal_code text null,
  phone text null,
  email text null,
  is_main boolean not null default false,
  is_active boolean not null default true,
  scheduled_deactivate_at timestamp without time zone null,
  constraint stores_pkey primary key (id),
  constraint stores_company_id_fkey foreign KEY (company_id) references companies (id)
) TABLESPACE pg_default;

create unique INDEX IF not exists one_main_store_per_company on public.stores using btree (company_id) TABLESPACE pg_default
where
  (is_main = true);

  create table public.subscription_items (
  created_at timestamp with time zone not null default now(),
  stripe_subscription_item_id text not null,
  stripe_price_id text not null,
  item_type text not null,
  plugin_key text null,
  quantity integer not null,
  updated_at timestamp with time zone not null default now(),
  id uuid not null default gen_random_uuid (),
  subscription_id uuid not null,
  unit_amount numeric null,
  currency text null default 'eur'::text,
  status text not null default 'active'::text,
  constraint subscription_items_pkey primary key (id),
  constraint subscription_items_plugin_key_fkey foreign KEY (plugin_key) references plugins (key),
  constraint subscription_items_subscription_id_fkey foreign KEY (subscription_id) references subscriptions (id)
) TABLESPACE pg_default;

create table public.subscriptions (
  created_at timestamp with time zone not null default now(),
  subscription_code text null,
  billing_period text null,
  billing_status text not null default 'active'::text,
  stripe_subscription_id text null,
  current_period_start timestamp with time zone null,
  current_period_end timestamp with time zone null,
  cancel_at_period_end boolean not null default false,
  cancel_at timestamp with time zone null,
  canceled_at timestamp with time zone null,
  updated_at timestamp with time zone not null default now(),
  id uuid not null default gen_random_uuid (),
  company_id uuid not null,
  plan_id uuid not null,
  currency text not null default 'eur'::text,
  trial_start timestamp with time zone null,
  trial_end timestamp with time zone null,
  stripe_subscription_schedule_id text null,
  constraint subscriptions_pkey primary key (id),
  constraint subscriptions_stripe_subscription_id_key unique (stripe_subscription_id),
  constraint subscriptions_stripe_subscription_schedule_id_key unique (stripe_subscription_schedule_id),
  constraint subscriptions_subscription_code_key unique (subscription_code),
  constraint subscriptions_company_id_fkey foreign KEY (company_id) references companies (id),
  constraint subscriptions_plan_id_fkey foreign KEY (plan_id) references plans (id)
) TABLESPACE pg_default;

create table public.units (
  id bigint generated by default as identity not null,
  unit_key text not null,
  name_singular text not null,
  name_plural text not null,
  symbol text null,
  description text null,
  is_system boolean not null default false,
  added_by_plugin_key text null,
  decimals integer not null default 2,
  created_at timestamp with time zone not null default now(),
  constraint units_pkey primary key (id),
  constraint units_unit_key_key unique (unit_key)
) TABLESPACE pg_default;

create table public.user_sessions (
  user_id uuid not null,
  refresh_token_hash text not null,
  fingerprint text not null,
  ip_address text null,
  user_agent text null,
  revoked boolean not null default false,
  expires_at timestamp with time zone not null,
  created_at timestamp with time zone not null default now(),
  last_activity_at timestamp with time zone not null default now(),
  last_login_at timestamp with time zone not null default now(),
  revoked_at timestamp with time zone null,
  id uuid not null default gen_random_uuid (),
  constraint user_sessions_pkey primary key (id),
  constraint user_sessions_refresh_token_hash_key unique (refresh_token_hash),
  constraint user_sessions_user_id_fkey foreign KEY (user_id) references users (id)
) TABLESPACE pg_default;

create table public.user_store_access (
  user_id uuid not null,
  id uuid not null default gen_random_uuid (),
  store_id uuid not null,
  created_at timestamp with time zone not null default now(),
  constraint user_store_access_pkey primary key (id),
  constraint user_store_access_store_id_fkey foreign KEY (store_id) references stores (id),
  constraint user_store_access_user_id_fkey foreign KEY (user_id) references users (id)
) TABLESPACE pg_default;

create table public.user_store_roles (
  id uuid not null default gen_random_uuid (),
  user_id uuid not null,
  company_id uuid not null,
  store_id uuid not null,
  role_id uuid not null,
  status text not null default 'active'::text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint user_store_roles_pkey primary key (id),
  constraint user_store_roles_user_store_unique unique (user_id, store_id),
  constraint user_store_roles_company_id_fkey foreign KEY (company_id) references companies (id),
  constraint user_store_roles_role_id_fkey foreign KEY (role_id) references roles (id),
  constraint user_store_roles_store_id_fkey foreign KEY (store_id) references stores (id),
  constraint user_store_roles_user_id_fkey foreign KEY (user_id) references users (id)
) TABLESPACE pg_default;

create table public.users (
  id uuid not null default gen_random_uuid (),
  created_at timestamp with time zone not null default now(),
  first_name text null,
  last_name text null,
  email text not null,
  password_hash text null,
  phone text null,
  email_verified boolean not null default false,
  phone_verified boolean not null default false,
  avatar_url text null,
  updated_at timestamp with time zone not null default now(),
  google_id text null,
  notification_preferences jsonb not null default '{}'::jsonb,
  constraint users_pkey primary key (id),
  constraint users_email_key unique (email),
  constraint users_google_id_key unique (google_id)
) TABLESPACE pg_default;

create table public.vat_rates (
  id bigint generated by default as identity not null,
  name text not null,
  rate numeric not null,
  country_code text not null,
  is_default boolean not null default false,
  created_at timestamp with time zone not null default now(),
  constraint vat_rates_pkey primary key (id)
) TABLESPACE pg_default;

create table public.vendors (
  id uuid not null default gen_random_uuid (),
  created_at timestamp with time zone not null default now(),
  name text not null,
  phone text null,
  email text null,
  tax_id text null,
  address text null,
  city text null,
  postal_code text null,
  notes text null,
  company_id uuid not null,
  country text null,
  created_by uuid null,
  contact_name text null,
  payment_terms text not null default 'immediate'::text,
  constraint vendors_pkey primary key (id),
  constraint vendors_company_id_fkey foreign KEY (company_id) references companies (id),
  constraint vendors_created_by_fkey foreign KEY (created_by) references users (id),
  constraint vendors_payment_terms_check check (
    (
      payment_terms = any (
        array[
          'immediate'::text,
          '15'::text,
          '30'::text,
          '60'::text,
          '90'::text
        ]
      )
    )
  )
) TABLESPACE pg_default;

create table public.verification_codes (
  code_hash text not null,
  type text not null,
  expires_at timestamp with time zone not null,
  created_at timestamp with time zone not null default now(),
  email text null,
  id uuid not null default gen_random_uuid (),
  user_id uuid null,
  delivery_method text not null,
  phone text null,
  consumed_at timestamp with time zone null,
  ip_address text null,
  fingerprint text null,
  attempts integer not null default 0,
  updated_at timestamp with time zone not null default now(),
  consumed boolean not null default false,
  constraint verification_codes_pkey primary key (id),
  constraint verification_codes_user_id_fkey foreign KEY (user_id) references users (id)
) TABLESPACE pg_default;