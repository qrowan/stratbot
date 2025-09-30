This project is to generalize trading bot stategies.

- Open / Edit / Close a position.
- A position is somtimes combined with positions in mulitiple protocols.
  \*- The positions in protocols is called "internal positions" of the position.
- A bot monitors market data and find opportunity to open/edit/close positions.
- A strategy contains process with finding opportunity, execute to edit a position. Editting a position contains a sequence of building, rolling back internal positions of it.
- If we want to add a new strategy, add required protocols' modules, and the strategy with how to find opporutnity and how to execute a position.
- 1 process can find multiple opportunities to order.
  - 1 opportunity - 1 execute - 1 receipt - 1 receipt id
    - 1 execute create multiple positions
      - 1 position - 1 position id
      - position has multiple internal positions in multiple protocols.

### Generalization of Protocol

- create order
- cancel order
- get order result
- get market data
- get internal positions of account

### Generalization of Position
