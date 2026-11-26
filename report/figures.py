import json, matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import Rectangle
R='results/'
site=json.load(open('data/site.json'))
iso=json.load(open(R+'isolated_g5_Df1.5.json'))
zcol={'BH-1':'#f7e7a8','BH-2':'#cfe3c8','BH-3':'#cfd9ee'}

# ---- Fig 1: plan of isolated footings (to scale) coloured by borehole zone, with footing size
fig,ax=plt.subplots(figsize=(9,4.6))
for c in iso['cols']:
    ax.add_patch(Rectangle((c['x']-c['B']/2,c['y']-c['B']/2),c['B'],c['B'],fc=zcol[c['bh']],ec='k',lw=0.8))
    ax.text(c['x'],c['y']+0.15,c['name'],ha='center',va='bottom',fontsize=8,fontweight='bold')
    ax.text(c['x'],c['y']-0.15,f"{c['B']:.1f}",ha='center',va='top',fontsize=8)
for x in (7.5,22.5): ax.axvline(x,color='r',ls='--',lw=0.8)
ax.text(3.7,-3.1,'zone BH-2',color='r',ha='center',fontsize=9); ax.text(15,-3.1,'zone BH-1',color='r',ha='center',fontsize=9); ax.text(26.3,-3.1,'zone BH-3',color='r',ha='center',fontsize=9)
ax.set_xlim(-3,33); ax.set_ylim(-3.8,18); ax.set_aspect('equal'); ax.set_xlabel('x (m), grid lines 1 to 7 at 5 m'); ax.set_ylabel('y (m), rows A to D')
ax.set_title('Isolated footings at Df = 1.5 m: side B (m) of each square footing, drawn to scale (g = 5)',fontsize=10); plt.tight_layout(); plt.savefig('report/fig/plan.png',dpi=170); plt.close()

# ---- Fig 2: isolated footings total settlement
fig,ax=plt.subplots(figsize=(9,4.2))
mx=max(c['Stot'] for c in iso['cols']); cm=plt.cm.YlOrRd
for c in iso['cols']:
    ax.add_patch(Rectangle((c['x']-2.1,c['y']-2.1),4.2,4.2,fc=cm(c['Stot']/mx*0.9),ec='k',lw=0.6))
    ax.text(c['x'],c['y'],f"{c['name']}\n{c['Stot']:.0f}",ha='center',va='center',fontsize=8)
ax.set_xlim(-3,33); ax.set_ylim(-3,18); ax.set_aspect('equal'); ax.set_xlabel('x (m)'); ax.set_ylabel('y (m)')
ax.set_title('Total settlement of each isolated footing (mm); IS 1904 limit 50 mm  (g = 5)',fontsize=10); plt.tight_layout(); plt.savefig('report/fig/iso_settlement.png',dpi=170); plt.close()

# ---- Fig 3: ground model (three boreholes)
fig,axs=plt.subplots(1,3,figsize=(9,4.6),sharey=True)
col={'fill':'#d9d4c7','sand':'#f1e2a6','gravel':'#c9c3b8','clay':'#a9c4e6','silt':'#e8d9b9'}
for ax,(bh,d) in zip(axs,site['boreholes'].items()):
    for L in d['layers']:
        ax.add_patch(Rectangle((0,L['top']),1,L['bot']-L['top'],fc=col[L['kind']],ec='k',lw=0.7))
        ax.text(0.5,(L['top']+L['bot'])/2,(L['sym'] if L['sym']!='-' else 'Fill'),ha='center',va='center',fontsize=8)
        for t in L.get('N',[]): ax.plot(1.08,t['z'],'ko' if not t.get('invalid') else 'o',mfc='k' if not t.get('invalid') else 'none',ms=3); ax.text(1.14,t['z'],('>100' if t['N']>=100 else str(t['N']))+('*' if t.get('invalid') else ''),va='center',fontsize=7)
    for z,ls,lab in ((d['wtHigh'],'-','design'),(d['wtMeasured'],'--','measured'),(d['wtLow'],':','low')):
        ax.plot([-0.05,1],[z,z],color='b',ls=ls,lw=1.4); ax.text(-0.08,z,f"{z}",ha='right',va='center',fontsize=7,color='b')
    ax.set_xlim(-0.4,1.6); ax.set_ylim(15,0); ax.set_xticks([]); ax.set_title(bh,fontsize=10)
axs[0].set_ylabel('Depth (m)'); fig.suptitle('Ground model (SPT N at right; * rejected; blue lines: water table design / measured / low)',fontsize=9); plt.tight_layout(); plt.savefig('report/fig/ground.png',dpi=170); plt.close()

# ---- Fig 4: raft settlement along row B for several founding depths (flexible), + rigid for the recommended
fig,ax=plt.subplots(figsize=(8.5,4.2))
xs=[i*5 for i in range(7)]
for Df,st in ((1.5,'-o'),(3.0,'-s'),(4.0,'-^'),(4.4,'-d')):
    d=json.load(open(R+f"raft_g5_Df{Df:g}_t0.9.json")); row=[c['Stot'] for c in d['cols'] if c['name'].startswith('B')]
    ax.plot(xs,row,st,label=f'Df = {Df} m (flexible raft, along row B)')
d=json.load(open(R+'raft_g5_Df4.4_t0.9.json')); r=d['rigid']; ymean=sum(c['Stot'] for c in d['cols'])/28
my=7.5; ax.plot([0,30],[r['mean']+r['bx']*(0-15)+r['by']*(5-my),r['mean']+r['bx']*(30-15)+r['by']*(5-my)],'k--',label='Df = 4.4 m rigid-raft plane (row B)')
ax.axhline(75,color='r',ls=':'); ax.text(12.5,71,'IS 1904 raft limit 75 mm',color='r',fontsize=8,va='bottom')
ax.set_xlabel('x along the 30 m length (m)'); ax.set_ylabel('Settlement (mm)'); ax.invert_yaxis(); ax.set_ylim(270,-5); ax.legend(fontsize=8); ax.set_title('Raft 31 x 16 m: settlement vs founding depth (g = 5)',fontsize=10); ax.grid(alpha=.3)
plt.tight_layout(); plt.savefig('report/fig/raft.png',dpi=170); plt.close()
print('figures ok')
