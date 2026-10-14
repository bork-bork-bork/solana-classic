const text=(tag,value,className)=>{const node=document.createElement(tag);node.textContent=value;if(className)node.className=className;return node;};
export function renderDevelopment(development){
  const target=document.getElementById('development-projects');if(!target)return;
  const cards=document.createDocumentFragment();
  for(const project of development?.projects??[]){
    const card=document.createElement('article');card.className='development-project';card.id='development-'+project.id;
    const heading=text('h3',project.title);heading.append(text('span',project.state==='building'?'In development':'Not started','development-state'));card.append(heading,text('p',project.description));
    const list=document.createElement('ul');list.className='development-milestones';
    for(const milestone of project.milestones??[]){const item=document.createElement('li');item.append(text('strong',milestone.title),text('span',milestone.state==='local-passed'?'Local checks passed':'Pending'));item.dataset.state=milestone.state;if(milestone.detail)item.append(text('small',milestone.detail));list.append(item);}
    card.append(list,text('p',project.currentScope,'development-scope'));
    if(/^https:\/\/github\.com\/solana-classic\/solana-classic\//.test(project.source??'')){const source=text('a','View source');source.href=project.source;source.target='_blank';source.rel='noopener noreferrer';card.append(source);}
    cards.append(card);
  }
  target.replaceChildren(cards);
  const reviewed=document.getElementById('development-reviewed');
  if(reviewed&&development?.reviewedAt){const at=new Date(development.reviewedAt);reviewed.textContent=Number.isFinite(at.getTime())?'Development checkpoint: '+new Intl.DateTimeFormat('en-GB',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'Europe/London'}).format(at)+' London. Source and test evidence are linked; production milestones remain separate.':'Development checkpoint unavailable.';}
}
