-- ==============================================================================
-- Seed: Template "Página de Oferta Pós-Resultado"
-- Sequência de blocos content/comparison/timer seguindo os padrões de alto e
-- médio impacto do teardown de funil (bio, benefícios, prova social, preço
-- ancorado, garantia, CTA, timer). Todo texto é placeholder genérico — edite
-- no builder antes de publicar. Não reproduz copy de nenhum funil real.
--
-- Execute no SQL Editor do Supabase. Pode ser aplicado a qualquer quiz pelo
-- botão "Usar Template" — as etapas entram como novas perguntas/blocos,
-- então normalmente você vai querer criar um quiz novo só com o diagnóstico
-- e depois copiar estes blocos para o final, ou aplicar isto isoladamente e
-- editar o início.
-- ==============================================================================

do $$
declare
  v_structure jsonb;
begin
  v_structure := jsonb_build_object(
    'questions', jsonb_build_array(
      -- 1. Autoridade — bio curta (padrão 03)
      jsonb_build_object(
        'title', 'Quem está te entregando este resultado',
        'type', 'content',
        'order_num', 0,
        'settings', jsonb_build_object(
          'body', '[Nome], [cargo/especialidade]. [Um número de impacto: ex "ajudou 500+ empresas a resolver X"].',
          'cta_label', 'Continuar'
        )
      ),

      -- 2. Benefícios como transformação (padrão 05)
      jsonb_build_object(
        'title', 'O que muda a partir de agora',
        'type', 'content',
        'order_num', 1,
        'settings', jsonb_build_object(
          'body', '• [Benefício 1 como resultado, não como feature]' || chr(10) ||
                  '• [Benefício 2]' || chr(10) ||
                  '• [Benefício 3]' || chr(10) ||
                  '• [Benefício 4]',
          'cta_label', 'Continuar'
        )
      ),

      -- 3. Metodologia numerada (padrão 06)
      jsonb_build_object(
        'title', '[Nome da sua metodologia própria]',
        'type', 'content',
        'order_num', 2,
        'settings', jsonb_build_object(
          'body', '1. [Etapa 1] — [antes] → [depois]' || chr(10) ||
                  '2. [Etapa 2] — [antes] → [depois]' || chr(10) ||
                  '3. [Etapa 3] — [antes] → [depois]',
          'cta_label', 'Continuar'
        )
      ),

      -- 4. Objeção antecipada (padrão 07)
      jsonb_build_object(
        'title', '"E se eu não souber por onde começar?"',
        'type', 'content',
        'order_num', 3,
        'settings', jsonb_build_object(
          'body', '[Resposta tranquilizadora à maior objeção do seu público — sem programar, sem migrar tudo de uma vez, com suporte, etc.]',
          'cta_label', 'Continuar'
        )
      ),

      -- 5. Estatística de contraste (padrão 08)
      jsonb_build_object(
        'title', 'O tamanho real do problema',
        'type', 'comparison',
        'order_num', 4,
        'settings', jsonb_build_object(
          'left_label', 'Hoje',
          'right_label', 'Com a solução',
          'rows', jsonb_build_array(
            jsonb_build_object('label', 'Esforço x Resultado', 'left_text', '[X]% esforço, [Y]% resultado', 'right_text', '[X]% esforço, [Z]% resultado')
          )
        )
      ),

      -- 6. Lista antes/depois espelhada (padrão 11 — alto impacto)
      jsonb_build_object(
        'title', 'O que muda com [nome do produto]',
        'type', 'comparison',
        'order_num', 5,
        'settings', jsonb_build_object(
          'left_label', 'Sem a solução',
          'right_label', 'Com a solução',
          'rows', jsonb_build_array(
            jsonb_build_object('label', '[Dor 1 do quiz]', 'left_text', '[estado atual]', 'right_text', '[resolvido]'),
            jsonb_build_object('label', '[Dor 2 do quiz]', 'left_text', '[estado atual]', 'right_text', '[resolvido]'),
            jsonb_build_object('label', '[Dor 3 do quiz]', 'left_text', '[estado atual]', 'right_text', '[resolvido]')
          )
        )
      ),

      -- 7. Prova social — depoimentos (padrão 09)
      jsonb_build_object(
        'title', 'Quem já resolveu isso',
        'type', 'content',
        'order_num', 6,
        'settings', jsonb_build_object(
          'testimonial_text', '[Citação real de cliente com resultado numérico e prazo]',
          'testimonial_author', '[Primeiro nome], [contexto opcional]',
          'cta_label', 'Continuar'
        )
      ),

      -- 8. Bônus empilhados (padrão 12)
      jsonb_build_object(
        'title', 'O que vem incluso',
        'type', 'content',
        'order_num', 7,
        'settings', jsonb_build_object(
          'body', '✓ [Bônus 1] — valor de R$ [X]' || chr(10) ||
                  '✓ [Bônus 2] — valor de R$ [X]' || chr(10) ||
                  '✓ [Bônus 3] — valor de R$ [X]',
          'cta_label', 'Continuar'
        )
      ),

      -- 9. Timer de urgência da oferta (padrão 14, 18 — alto impacto)
      jsonb_build_object(
        'title', 'Esta condição expira em breve',
        'type', 'timer',
        'order_num', 8,
        'settings', jsonb_build_object(
          'body', '[Descreva o que expira: desconto, bônus, vaga limitada]',
          'duration_seconds', 600,
          'cta_label', 'Ver oferta'
        )
      ),

      -- 10. Garantia (padrão 16)
      jsonb_build_object(
        'title', 'Garantia de [N] dias',
        'type', 'content',
        'order_num', 9,
        'settings', jsonb_build_object(
          'body', '[Descreva a garantia como responsabilidade compartilhada — "se não funcionar para você, nós devolvemos", não como cláusula legal.]',
          'cta_label', 'Quero começar agora'
        )
      )
    )
  );

  insert into public.quiz_templates (name, description, category, thumbnail_emoji, structure, is_active)
  values (
    'Página de Oferta Pós-Resultado',
    'Sequência de 10 telas (autoridade, benefícios, metodologia, prova social, preço, urgência, garantia) para vir depois do diagnóstico calculado. Todo texto é placeholder — edite antes de publicar.',
    'marketing',
    '🎯',
    v_structure,
    true
  );

  raise notice 'Template "Página de Oferta Pós-Resultado" criado.';
end $$;
